import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SimulationSnapshot } from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Notice, Pill, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

function countryName(snapshot: SimulationSnapshot, countryId: number | null): string {
  if (countryId === null) return "unowned";
  const country = snapshot.countries.find((candidate) => candidate.id === countryId);
  return country === undefined ? `country ${countryId}` : `${country.tag} — ${country.name}`;
}

function regionName(snapshot: SimulationSnapshot, regionId: number | null): string {
  if (regionId === null) return "none";
  const region = snapshot.regions.find((candidate) => candidate.id === regionId);
  return region === undefined ? `region ${regionId}` : region.name;
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
  const [recruitRegionId, setRecruitRegionId] = useState<number | null>(null);
  const [personnelText, setPersonnelText] = useState("1000");
  const [deployArmyId, setDeployArmyId] = useState<number | null>(null);
  const [targetRegionId, setTargetRegionId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLocalError(null);
    if (country === null) return;
    setTargetCountryId(null);
    setRecruitRegionId(country.regionIds[0] ?? null);
    setDeployArmyId(country.military.armies[0]?.id ?? null);
    setTargetRegionId(country.regionIds[0] ?? null);
  }, [countryId, country?.regionIds, country?.military.armies.length]);

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
    if (recruitRegionId === null) {
      setLocalError("Choose a recruitment region.");
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
      regionId: recruitRegionId,
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
  const ownRegions = snapshot.regions.filter((region) => region.sovereignCountryId === country.id);
  const deployTargets = snapshot.regions.filter((region) => {
    if (region.id === country.regionIds[0] && region.id === targetRegionId) return true;
    if (region.sovereignCountryId === country.id) return true;
    if (region.controllerCountryId === country.id) return true;
    if (region.sovereignCountryId === null) return false;
    const war = snapshot.military.wars.find(
      (candidate) =>
        candidate.endedDay === null &&
        ((candidate.attackerCountryId === country.id &&
          candidate.defenderCountryId === region.sovereignCountryId) ||
          (candidate.defenderCountryId === country.id &&
            candidate.attackerCountryId === region.sovereignCountryId)),
    );
    return war !== undefined;
  });
  // Declarations may target any country, including summaries not focused for detail.
  const declareTargets = snapshot.countrySummaries.filter(
    (candidate) => candidate.id !== country.id,
  );
  const parsedPersonnel = Number(personnelText);
  const recruitError =
    !Number.isInteger(parsedPersonnel) || parsedPersonnel <= 0
      ? "Personnel must be a positive integer."
      : null;
  const recruitRegion =
    recruitRegionId === null
      ? null
      : (snapshot.regions.find((region) => region.id === recruitRegionId) ?? null);
  // The snapshot exposes region population, an upper bound on the authoritative
  // 18-45 recruitable pool; the worker enforces the exact recruitable and cost limits.
  const personnelMin = 1000;
  // A conservative fraction of the region population: the authoritative pool is
  // the eligible 18-45 population, so the slider must not invite impossible sizes.
  const personnelMax = Math.max(
    personnelMin,
    Math.round((recruitRegion?.population ?? 0) * 0.25),
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
            <StatRow label={`Army ${army.id}`} value={regionName(snapshot, army.regionId)} />
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
                army.destinationRegionId === null
                  ? `ready from day ${army.readyDay}`
                  : `to ${regionName(snapshot, army.destinationRegionId)} on day ${army.arrivalDay ?? "?"}`
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
      <Text style={styles.label}>Region</Text>
      <View style={styles.wrap}>
        {ownRegions.map((region) => (
          <Pill
            key={region.id}
            label={region.name}
            active={recruitRegionId === region.id}
            disabled={!canAct}
            onPress={() => setRecruitRegionId(region.id)}
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
        hint="Whole soldiers drawn from the region's 18-45 population and paid by the treasury."
      />
      {recruitError !== null ? <Text style={styles.warning}>{recruitError}</Text> : null}
      <ActionButton
        label="Recruit"
        disabled={!canAct || recruitRegionId === null || recruitError !== null}
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
      <Text style={styles.label}>Target region</Text>
      <View style={styles.wrap}>
        {deployTargets.map((region) => (
          <Pill
            key={region.id}
            label={`${region.name}${region.occupiedSinceDay === null ? "" : " (occupied)"}`}
            active={targetRegionId === region.id}
            disabled={!canAct}
            onPress={() => setTargetRegionId(region.id)}
          />
        ))}
      </View>
      <ActionButton
        label="Deploy"
        disabled={!canAct || deployArmyId === null || targetRegionId === null}
        onPress={() => {
          if (deployArmyId === null || targetRegionId === null) {
            setLocalError("Choose an army and a target region.");
            return;
          }
          submit({
            kind: "deploy-army",
            countryId: country.id,
            armyId: deployArmyId,
            targetRegionId,
          });
        }}
      />

      <Text style={styles.heading}>Territorial control</Text>
      {country.military.occupiedRegionIds.length > 0 ? (
        <StatRow
          label="Occupied regions"
          value={country.military.occupiedRegionIds
            .map((regionId) => regionName(snapshot, regionId))
            .join(", ")}
        />
      ) : null}
      {snapshot.military.occupations
        .filter((occupation) => occupation.sovereignCountryId === country.id)
        .map((occupation) => (
          <StatRow
            key={occupation.regionId}
            label={`Occupied by ${countryName(snapshot, occupation.controllerCountryId)}`}
            value={`${regionName(snapshot, occupation.regionId)} since day ${occupation.occupiedSinceDay ?? "?"}`}
          />
        ))}
      <Text style={styles.help}>
        Occupation changes only military control. It never transfers sovereignty, treasury,
        buildings, people, markets, or monetary authority. A peace treaty is the only M10
        action that changes sovereignty, and only for regions the offering side controls.
      </Text>
      <Text style={styles.help}>
        Army personnel are drawn from the region's people aged 18–45 and paid from
        the treasury. Combat casualties reduce the roster and are recorded as deaths,
        wounded, or captured; no abstract war score exists.
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.muted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  label: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.muted,
  },
  help: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  warning: {
    marginTop: 4,
    fontSize: 12,
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
});
