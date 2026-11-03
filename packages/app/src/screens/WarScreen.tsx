import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { SimulationSnapshot } from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Headline, Notice, Pill, Section, StatRow } from "../components/ui";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { provinceEconomyRows } from "@century/sim-worker";
import { provinceDisplayName } from "../provinceNames";

function countryName(snapshot: SimulationSnapshot, countryId: number | null): string {
  if (countryId === null) return "unowned";
  const country = snapshot.countries.find((candidate) => candidate.id === countryId);
  return country === undefined ? `country ${countryId}` : `${country.tag} — ${country.name}`;
}

/** Most provinces offered as quick picks per list; a province is always reachable from the map. */
const PICK_LIMIT = 12;

/** The most populous provinces of a list, keeping `keep` (the current pick) in view. */
function topByPopulation<T extends { readonly id: number; readonly population: number }>(
  provinces: readonly T[],
  keep: number | null,
): readonly T[] {
  const sorted = [...provinces].sort((left, right) => right.population - left.population || left.id - right.id);
  const top = sorted.slice(0, PICK_LIMIT);
  const kept = keep === null ? undefined : sorted.find((province) => province.id === keep);
  return kept !== undefined && !top.includes(kept) ? [...top, kept] : top;
}

function provinceName(snapshot: SimulationSnapshot, provinceId: number | null): string {
  if (provinceId === null) return "none";
  const province = provinceEconomyRows(snapshot).find((candidate) => candidate.id === provinceId);
  return province === undefined ? `province ${provinceId}` : provinceDisplayName(province.id);
}

export function WarScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, busy, connection, error, clearError } = useSimulation();
  const country = snapshot.countries.find((candidate) => candidate.id === countryId) ?? null;
  const [targetCountryId, setTargetCountryId] = useState<number | null>(null);
  const [casusBelli, setCasusBelli] = useState<
    "border-dispute" | "trade-dispute" | "alliance-obligation"
  >("border-dispute");
  const [recruitProvinceId, setRecruitProvinceId] = useState<number | null>(null);
  const [personnelText, setPersonnelText] = useState("1000");
  const [deployArmyId, setDeployArmyId] = useState<number | null>(null);
  const [targetProvinceId, setTargetProvinceId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLocalError(null);
    if (country === null) return;
    setTargetCountryId(null);
    const mostPopulous =
      provinceEconomyRows(snapshot)
        .filter((province) => province.countryId === country.id)
        .sort((left, right) => right.population - left.population || left.id - right.id)[0]?.id ??
      country.provinceIds[0] ??
      null;
    setRecruitProvinceId(mostPopulous);
    setDeployArmyId(country.military.armies[0]?.id ?? null);
    setTargetProvinceId(mostPopulous);
  }, [countryId, country?.provinceIds, country?.military.armies.length]);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;
  const requirePlayer = (): boolean => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may make diplomatic or military decisions.");
      return false;
    }
    return true;
  };
  const submit = (action: Parameters<typeof applyAction>[0]): void => {
    if (!requirePlayer()) return;
    setLocalError(null);
    clearError();
    applyAction(action);
  };
  const applyRecruit = (personnelOverride?: number): void => {
    if (country === null) return;
    if (!requirePlayer()) return;
    const personnel = personnelOverride ?? Number(personnelText);
    if (recruitProvinceId === null) {
      setLocalError("Choose a recruitment province.");
      return;
    }
    if (!Number.isInteger(personnel) || personnel <= 0) {
      setLocalError("Personnel must be a positive integer.");
      return;
    }
    setLocalError(null);
    clearError();
    applyAction({
      kind: "recruit-army",
      countryId: country.id,
      provinceId: recruitProvinceId,
      personnel,
    });
  };

  // Unconditional hook before the country guard. applyRecruit narrows country and
  // sends the recruit-army action immediately on release.
  const personnelCommit = useDeferredCommit(
    (value) => applyRecruit(Math.round(value)),
    busy,
  );

  if (country === null) {
    return (
      <Section title="War & diplomacy">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const enemies = snapshot.military.wars
    .filter(
      (war) =>
        war.endedDay === null &&
        (war.attackerCountryId === country.id || war.defenderCountryId === country.id),
    )
    .map((war) => ({
      war,
      opponentId:
        war.attackerCountryId === country.id ? war.defenderCountryId : war.attackerCountryId,
    }));
  const incomingOffers = snapshot.military.peaceOffers.filter(
    (offer) => offer.toCountryId === country.id,
  );
  // P2: a country has up to hundreds of provinces, so the quick picks are the most
  // populous ones; every province the worker would accept is still a valid target.
  const ownProvinces = topByPopulation(
    provinceEconomyRows(snapshot).filter((province) => province.countryId === country.id),
    recruitProvinceId,
  );
  const controlled = provinceEconomyRows(snapshot).filter(
    (province) => province.controllerCountryId === country.id,
  );
  const enemyProvinces = provinceEconomyRows(snapshot).filter((province) => {
    if (province.countryId === null || province.countryId === country.id) return false;
    if (province.controllerCountryId === country.id) return false;
    const war = snapshot.military.wars.find(
      (candidate) =>
        candidate.endedDay === null &&
        ((candidate.attackerCountryId === country.id &&
          candidate.defenderCountryId === province.countryId) ||
          (candidate.defenderCountryId === country.id &&
            candidate.attackerCountryId === province.countryId)),
    );
    return war !== undefined;
  });
  const deployTargets = [
    ...topByPopulation(
      provinceEconomyRows(snapshot).filter((province) => province.countryId === country.id),
      targetProvinceId,
    ),
    ...controlled,
    ...topByPopulation(enemyProvinces, targetProvinceId),
  ].filter((province, index, all) => all.findIndex((other) => other.id === province.id) === index);
  // Declarations may target any country, including summaries not focused for detail.
  const declareTargets = snapshot.countrySummaries.filter(
    (candidate) => candidate.id !== country.id,
  );
  const parsedPersonnel = Number(personnelText);
  const recruitError =
    !Number.isInteger(parsedPersonnel) || parsedPersonnel <= 0
      ? "Personnel must be a positive integer."
      : null;
  const recruitProvince =
    recruitProvinceId === null
      ? null
      : (provinceEconomyRows(snapshot).find((province) => province.id === recruitProvinceId) ?? null);
  // The snapshot exposes province population, an upper bound on the authoritative
  // 18-45 recruitable pool; the worker enforces the exact recruitable and cost limits.
  const personnelMin = 1000;
  // A conservative fraction of the province population: the authoritative pool is
  // the eligible 18-45 population, so the slider must not invite impossible sizes.
  const personnelMax = Math.max(
    personnelMin,
    Math.round((recruitProvince?.population ?? 0) * 0.25),
  );
  const personnelSliderValue = Number.isFinite(parsedPersonnel)
    ? Math.min(personnelMax, Math.max(personnelMin, parsedPersonnel))
    : personnelMin;

  return (
    <Section title="War & diplomacy">
      {error !== null ? (
        <Notice title="Action rejected" tone="warning">
          {error}
        </Notice>
      ) : null}
      {localError !== null ? (
        <Notice title="Cannot act" tone="warning">
          {localError}
        </Notice>
      ) : null}
      {!isPlayerCountry ? (
        <Notice title="Read-only country" tone="info">
          These are the observed wars, armies, and occupations of the selected country. Only
          the player-controlled country can act.
        </Notice>
      ) : null}

      <Headline
        label="Wars under way"
        value={String(snapshot.military.wars.filter((war) => war.endedDay === null).length)}
        detail={`${String(country.military.occupiedProvinceIds.length)} provinces occupied · ${String(country.military.controlledProvinceIds.length)} controlled abroad`}
      />

      <Text style={styles.heading}>Wars</Text>
      {snapshot.military.wars.length === 0 ? (
        <Text style={styles.empty}>No war has been declared.</Text>
      ) : (
        snapshot.military.wars.map((war) => (
          <View key={war.id} style={styles.block}>
            <StatRow
              label={`War ${war.id}`}
              value={`${countryName(snapshot, war.attackerCountryId)} vs ${countryName(snapshot, war.defenderCountryId)}`}
            />
            <StatRow label="Casus belli" value={war.casusBelli} />
            <StatRow
              label="Status"
              value={
                war.endedDay === null
                  ? `active since day ${war.startedDay}`
                  : `ended day ${war.endedDay}, truce to ${war.truceUntilDay ?? "none"}`
              }
            />
            {war.endedDay === null ? (
              <StatRow
                label="Fielded personnel"
                value={`${war.attackerPersonnel} vs ${war.defenderPersonnel}`}
              />
            ) : null}
            {war.endedDay === null &&
            (war.attackerCountryId === country.id || war.defenderCountryId === country.id) ? (
              <View style={styles.row}>
                <ActionButton
                  label="Offer white peace"
                  disabled={!canAct}
                  onPress={() =>
                    submit({
                      kind: "offer-peace",
                      countryId: country.id,
                      warId: war.id,
                      terms: "white-peace",
                    })
                  }
                />
                <ActionButton
                  label="Offer cede-occupied"
                  disabled={!canAct}
                  onPress={() =>
                    submit({
                      kind: "offer-peace",
                      countryId: country.id,
                      warId: war.id,
                      terms: "cede-occupied",
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        ))
      )}

      {enemies.length > 0 ? (
        <>
          <Text style={styles.heading}>Current enemies</Text>
          {enemies.map(({ war, opponentId }) => (
            <StatRow
              key={war.id}
              label={countryName(snapshot, opponentId)}
              value={war.endedDay === null ? "at war" : "truce"}
            />
          ))}
        </>
      ) : null}

      {incomingOffers.length > 0 ? (
        <>
          <Text style={styles.heading}>Pending peace offers</Text>
          {incomingOffers.map((offer) => (
            <View key={offer.id} style={styles.row}>
              <Text style={styles.offerText}>
                {countryName(snapshot, offer.fromCountryId)}: {offer.terms}
              </Text>
              <ActionButton
                label="Accept"
                disabled={!canAct}
                onPress={() =>
                  submit({
                    kind: "accept-peace",
                    countryId: country.id,
                    warId: offer.warId,
                    offerId: offer.id,
                  })
                }
              />
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.heading}>Declare war</Text>
      <Text style={styles.label}>Target country</Text>
      <View style={styles.wrap}>
        {declareTargets.map((target) => (
          <Pill
            key={target.id}
            label={target.tag}
            active={targetCountryId === target.id}
            disabled={!canAct}
            onPress={() => setTargetCountryId(target.id)}
          />
        ))}
      </View>
      <Text style={styles.label}>Casus belli</Text>
      <View style={styles.wrap}>
        {(["border-dispute", "trade-dispute", "alliance-obligation"] as const).map((reason) => (
          <Pill
            key={reason}
            label={reason}
            active={casusBelli === reason}
            disabled={!canAct}
            onPress={() => setCasusBelli(reason)}
          />
        ))}
      </View>
      <ActionButton
        label="Declare war"
        disabled={!canAct || targetCountryId === null}
        onPress={() => {
          if (targetCountryId === null) {
            setLocalError("Choose a target country.");
            return;
          }
          submit({
            kind: "declare-war",
            countryId: country.id,
            targetCountryId,
            casusBelli,
          });
        }}
      />

      <Text style={styles.heading}>Armies ({country.military.armies.length})</Text>
      {country.military.armies.length === 0 ? (
        <Text style={styles.empty}>No army has been recruited.</Text>
      ) : (
        country.military.armies.map((army) => (
          <View key={army.id} style={styles.block}>
            <StatRow label={`Army ${army.id}`} value={provinceName(snapshot, army.provinceId)} />
            <StatRow
              label="Roster"
              value={`${army.personnel} soldiers, ${army.equipmentUnits} equipment`}
            />
            <StatRow
              label="Organization / supply"
              value={`${(army.organization * 100).toFixed(0)}% / ${(army.supply * 100).toFixed(0)}%`}
            />
            <StatRow
              label="Casualties (dead/captured cumulative; wounded current)"
              value={`${army.deaths} dead, ${army.wounded} wounded, ${army.captured} captured`}
            />
            <StatRow
              label="Movement"
              value={
                army.destinationProvinceId === null
                  ? `ready from day ${army.readyDay}`
                  : `to ${provinceName(snapshot, army.destinationProvinceId)} on day ${army.arrivalDay ?? "?"}`
              }
            />
          </View>
        ))
      )}
      <StatRow
        label="Military deaths (cumulative)"
        value={String(country.military.deaths)}
      />
      <StatRow label="Wounded (current roster)" value={String(country.military.wounded)} />
      <StatRow
        label="Captured (cumulative)"
        value={String(country.military.captured)}
      />

      <Text style={styles.heading}>Recruit an army</Text>
      <Text style={styles.label}>Province (most populous)</Text>
      <View style={styles.wrap}>
        {ownProvinces.map((province) => (
          <Pill
            key={province.id}
            label={provinceDisplayName(province.id)}
            active={recruitProvinceId === province.id}
            disabled={!canAct}
            onPress={() => setRecruitProvinceId(province.id)}
          />
        ))}
      </View>
      <Text style={styles.label}>Personnel</Text>
      <SliderField
        label="Recruitment personnel"
        value={personnelSliderValue}
        min={personnelMin}
        max={personnelMax}
        step={1000}
        precision={0}
        unit="soldiers"
        disabled={!canAct}
        pending={personnelCommit.hasPending}
        onChange={(value) => setPersonnelText(String(Math.round(value)))}
        onCommit={(value) => personnelCommit.submit(Math.round(value))}
        hint="Whole soldiers drawn from the province's 18-45 population and paid by the treasury."
      />
      {recruitError !== null ? <Text style={styles.warning}>{recruitError}</Text> : null}
      <ActionButton
        label="Recruit"
        disabled={!canAct || recruitProvinceId === null || recruitError !== null}
        onPress={() => applyRecruit()}
      />

      <Text style={styles.heading}>Deploy an army</Text>
      <Text style={styles.label}>Army</Text>
      <View style={styles.wrap}>
        {country.military.armies.map((army) => (
          <Pill
            key={army.id}
            label={`Army ${army.id}`}
            active={deployArmyId === army.id}
            disabled={!canAct}
            onPress={() => setDeployArmyId(army.id)}
          />
        ))}
      </View>
      <Text style={styles.label}>Target province</Text>
      <View style={styles.wrap}>
        {deployTargets.map((province) => (
          <Pill
            key={province.id}
            label={`${provinceDisplayName(province.id)}${province.controlledSinceDay === null ? "" : " (occupied)"}`}
            active={targetProvinceId === province.id}
            disabled={!canAct}
            onPress={() => setTargetProvinceId(province.id)}
          />
        ))}
      </View>
      <ActionButton
        label="Deploy"
        disabled={!canAct || deployArmyId === null || targetProvinceId === null}
        onPress={() => {
          if (deployArmyId === null || targetProvinceId === null) {
            setLocalError("Choose an army and a target province.");
            return;
          }
          submit({
            kind: "deploy-army",
            countryId: country.id,
            armyId: deployArmyId,
            targetProvinceId,
          });
        }}
      />

      <Text style={styles.heading}>Territorial control</Text>
      {country.military.occupiedProvinceIds.length > 0 ? (
        <StatRow
          label="Occupied provinces"
          value={country.military.occupiedProvinceIds
            .map((provinceId) => provinceName(snapshot, provinceId))
            .join(", ")}
        />
      ) : null}
      {snapshot.military.occupations
        .filter((occupation) => occupation.sovereignCountryId === country.id)
        .map((occupation) => (
          <StatRow
            key={occupation.provinceId}
            label={`Occupied by ${countryName(snapshot, occupation.controllerCountryId)}`}
            value={`${provinceName(snapshot, occupation.provinceId)} since day ${occupation.occupiedSinceDay ?? "?"}`}
          />
        ))}
      <Text style={styles.help}>
        Occupation changes only military control. It never transfers sovereignty, treasury,
        buildings, people, markets, or monetary authority. A peace treaty is the only M10
        action that changes sovereignty, and only for provinces the offering side controls.
      </Text>
      <Text style={styles.help}>
        Army personnel are drawn from the province's people aged 18–45 and paid from
        the treasury. Combat casualties reduce the roster and are recorded as deaths,
        wounded, or captured; no abstract war score exists.
      </Text>
    </Section>
  );
}

const styles = themedSheet(() => ({
  empty: {
    color: colors.muted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
  },
  label: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.muted,
  },
  help: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  warning: {
    marginTop: 4,
    fontSize: 13,
    color: colors.red,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  block: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  offerText: {
    flexShrink: 1,
    color: colors.text,
  },
}));
