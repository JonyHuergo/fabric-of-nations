import {
  PROTOCOL_VERSION,
  WorkerSupervisor,
  parseWorkerEvent,
  type SimulationSnapshot,
  type WorkerCommand,
  type WorkerEvent,
  encodeProvinceEconomyTable,
} from "@century/sim-worker";

class ManualScheduler {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { readonly at: number; readonly callback: () => void }>();

  public setTimeout(callback: () => void, milliseconds: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.now + milliseconds, callback });
    return id;
  }

  public clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  public advance(milliseconds: number): void {
    this.now += milliseconds;
    let ran = true;
    while (ran) {
      ran = false;
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= this.now)
        .sort((left, right) => left[1].at - right[1].at);
      const first = due[0];
      if (first === undefined) return;
      this.tasks.delete(first[0]);
      first[1].callback();
      ran = true;
    }
  }

  public get pending(): number {
    return this.tasks.size;
  }
}

function command(
  type: WorkerCommand["type"],
  commandId: string,
  extra: Partial<WorkerCommand> = {},
): WorkerCommand {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId, ...extra } as WorkerCommand;
}

function validSnapshot(sequence = 1): SimulationSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    sequence,
    dayIndex: 0,
    date: { year: 1900, month: 1, day: 1, label: "1900-01-01" },
    running: false,
    speedDaysPerSecond: 1,
    achievedDaysPerSecond: 0,
    speedIsBestEffort: true,
    campaignComplete: false,
    scenarioId: "test",
    dataVersion: "test",
    simVersion: "test",
    playerCountryId: null,
    focusCountryId: null,
    focusProvince: null,
    constructionEnabled: false,
    countries: [
      {
        id: 0,
        tag: "USA",
        name: "United States",
        currencyId: 0,
        monetaryArrangement: "own",
        meta: null,
        demography: null,
        provinceIds: [0],
        fiscal: {
          incomeTaxRate: 0.1,
          incomeTaxAllowanceRUSDPerYear: 0,
          welfareBudgetRUSDPerYear: 0,
          welfareMaxWealthLevel: 99,
          businessProfitTaxRate: 0,
          reserveTargetRUSD: 0,
        },
        treasuryCashRUSD: 100,
        debtEnabled: false,
        debtOutstandingPrincipalRUSD: 0,
        debtInterestPayableRUSD: 0,
        debtPolicy: {
          enabled: false,
          refinanceOnMaturity: false,
          maxOutstandingPrincipalRUSD: 0,
          creditorKind: "country",
          creditorId: 0,
          creditorLabel: "Country 0",
          annualCouponRate: 0,
          termDays: 365,
          arrearsGraceDays: 0,
          creditorCashRUSD: 0,
          headroomRUSD: 0,
        },
        debtContracts: [],
        population: 100,
        workingAgePopulation: 60,
        employedWorkers: 50,
        householdCashRUSD: 10,
        estimatedDailyWageBaseRUSD: 1,
        estimatedDailyTaxableWageBaseRUSD: 1,
        estimatedWageEarningBlockCount: 1,
        businessTaxBaseMonthToDateRUSD: 0,
        budgetMonthToDate: {
          welfareRequestedRUSD: 0,
          welfareShortfallRUSD: 0,
          businessTaxAssessedRUSD: 0,
          businessTaxUncollectedRUSD: 0,
          debtIssuedRUSD: 0,
          principalRepaidRUSD: 0,
          interestPaidRUSD: 0,
          unfinancedRequirementRUSD: 0,
          constructionSpentRUSD: 0,
          constructionWrittenOffRUSD: 0,
          constructionMaterialsSpentRUSD: 0,
          subsidyRequestedRUSD: 0,
          subsidyShortfallRUSD: 0,
          publicEnterpriseSupportRUSD: 0,
          businessTaxBaseMonthToDateRUSD: 0,
        },
        literacy: 0.9,
        wealthLevel: 20,
        militancy: 0.1,
        hardshipPopulationShare: 0,
        blocksWithUnmetSubsistence: 0,
        blocksWithUnmetBasic: 0,
        buildingCount: 1,
        productionCapacityByGood: [],
        latestFiscal: null,
        financeHistory: [],
        annualReports: [],
        constructionProjects: [],
        constructionHistory: {
          projectsCompleted: 0,
          projectsCancelled: 0,
          totalSpentRUSD: 0,
          totalWrittenOffRUSD: 0,
        },
        constructionLabor: { idleWorkers: 0, dailyWageRUSD: 0 },
        constructionInProgressRUSD: 0,
        publicCapitalRUSD: 0,
        industrialPolicy: {
          sectors: [
            { index: 0, key: "agriculture", label: "Agriculture", subsidyRate: 0, estimatedDailyOutputValueRUSD: 0 },
            { index: 1, key: "food-processing", label: "Food processing", subsidyRate: 0, estimatedDailyOutputValueRUSD: 0 },
            { index: 2, key: "textiles", label: "Textiles", subsidyRate: 0, estimatedDailyOutputValueRUSD: 0 },
            { index: 3, key: "manufacturing", label: "Manufacturing", subsidyRate: 0, estimatedDailyOutputValueRUSD: 0 },
            { index: 4, key: "storage", label: "Storage", subsidyRate: 0, estimatedDailyOutputValueRUSD: 0 },
          ],
          requestedMonthToDateRUSD: 0,
          paidMonthToDateRUSD: 0,
          shortfallMonthToDateRUSD: 0,
        },
        publicEnterprises: [],
        politics: {
          enabled: false,
          regimeKind: "absolute-monarchy",
          regimeName: "Absolute monarchy",
          governmentGroupKey: "aristocrats",
          governmentGroupName: "Aristocrats",
          nextElectionDay: null,
          lastElectionDay: null,
          lastElection: null,
          crisis: { stage: "none", sinceDay: 0, pressureDays: 0, pressure: 0 },
          franchiseShare: 0,
          eligiblePopulation: 0,
          supportForGovernment: 0,
          taxCollectionEfficiency: 1,
          constructionProgressFactor: 1,
          interestGroups: [],
          institution: {
            fundedAnnualRUSD: 0,
            quality: 1,
            overload: 0,
            serviceOutputIndex: 1,
            staffedPopulation: 0,
            fundingRequestedMonthToDateRUSD: 0,
            fundingShortfallMonthToDateRUSD: 0,
            disruptionUntilDay: null,
          },
          lawSlots: [],
          lawTransitions: [],
          lawOptions: [],
          deferredLawSlots: [],
          recentLog: [],
        },
        technology: {
          enabled: false,
          statuses: [],
          researchedCount: 0,
          activeProjectTechnologyId: null,
          researchBlockedReason: "no-technology-definitions",
          productivityBySector: [],
          mortalityFactor: 1,
          educationBonus: 0,
        },
        education: {
          enabled: false,
          fundedAnnualRUSD: 0,
          researchStaffShare: 0,
          academicPopulation: 0,
          availableAcademicWorkers: 0,
          researchStaff: 0,
          teacherStaff: 0,
          schoolAgePopulation: 0,
          teachingCapacityStudents: 0,
          enrolledStudents: 0,
          attendanceRate: 0,
          fundingAdequacy: 0,
          quality: 0,
          serviceOutputIndex: 0,
          fundingRequestedMonthToDateRUSD: 0,
          fundingShortfallMonthToDateRUSD: 0,
          researchBlockedReason: "no-technology-definitions",
          educationBlockedReason: "no-technology-definitions",
          lastUpdateDay: null,
        },
        labor: {
          trainingBudgetRUSDPerYear: 0,
          trainingStipendPerTraineeRUSDPerYear: 0,
          trainingStaffShare: 0,
          trainingParticipation: 0,
          trainingInstructors: 0,
          eligibleWorkingAge: 0,
          capacityTrainees: 0,
          trainees: 0,
          trainingRequestedMonthToDateRUSD: 0,
          trainingShortfallMonthToDateRUSD: 0,
          trainingBlockedReason: "no-funding",
          qualificationAverage: 0,
          healthStaffShare: 0,
          healthStaff: 0,
          administrationStaff: 0,
          healthServiceOutputIndex: 0,
          healthMortalityFactor: 1,
          healthBlockedReason: "no-administration-staff",
          minimumWageRUSDPerYear: 0,
          hoursPerWeek: 0,
          hoursFactor: 1,
        },
        trade: {
          tariffRates: [0],
          importQuotaQuantity: [null],
          importQuotaUsedQuantity: [0],
          exportRestricted: [false],
          customsMarketIds: [0],
          lastUpdateDay: null,
          exportsValueMonthToDateRUSD: 0,
          importsValueMonthToDateRUSD: 0,
          dutyReceivedMonthToDateRUSD: 0,
          dutyPaidMonthToDateRUSD: 0,
          freightPaidMonthToDateRUSD: 0,
        },
        priceIndex: {
          baseDayIndex: 0,
          value: 100,
          coverage: 1,
          monthOnMonthInflation: null,
          yearOnYearInflation: null,
        },
        military: {
          armies: [],
          deaths: 0,
          wounded: 0,
          captured: 0,
          relations: [],
          occupiedProvinceIds: [],
          controlledProvinceIds: [],
        },
        monetary: {
          hasAuthority: false,
          active: false,
          regime: "pegged",
          parityRusdPerUnit: null,
          valuationRusdPerUnit: null,
          reserveCashRUSD: 0,
          currencyIssuedUnits: 0,
          liabilityRUSD: 0,
          reserveCoverMonths: null,
          convertibility: "no-authority",
          lastParityChangeDay: null,
          lastMonthExportsRUSD: 0,
          lastMonthImportsRUSD: 0,
          blockedReason: "monetary-system-disabled",
        },
      },
    ],
    provinceTable: encodeProvinceEconomyTable(
      [
        { id: 0, countryId: 0, marketId: 0, population: 100, populationByProfession: {}, buildingCount: 1, buildingLevels: 1, employedWorkers: 0, unrest: 0, infrastructure: 0.5, urbanShare: 0, arableLandHa: 0, pastureHa: 0, literacy: 0, controllerCountryId: null, controlledSinceDay: null, territoryTag: null },
      ],
      [],
    ),
    territories: [],
    professions: [],
    provinces: [],
    countrySummaries: [
      {
        id: 0,
        tag: "USA",
        name: "United States",
        historicalName: "United States",
        status: "independent",
        sovereignCountryId: 0,
        capitalName: "Washington",
        selectable: true,
        isPlayer: false,
        isFocused: false,
        provinceIds: [0],
        marketIds: [0],
        population: 100,
        workingAgePopulation: 60,
        employedWorkers: 0,
        treasuryCashRUSD: 100,
        hardshipPopulationShare: 0,
        literacy: 0.5,
        wealthLevel: 1,
        militancy: 0,
        militaryPersonnel: 0,
        latestNetFiscalResultRUSD: null,
      },
    ],
    markets: [
      {
        id: 0,
        label: "Test Market",
        name: "Test Market",
        description: "A test market.",
        kind: "national",
        memberCountryIds: [0],
        provinceIds: [0],
        prices: [
          {
            goodId: 0,
            goodKey: "grain",
            goodName: "Grain",
            unitLabel: "kg",
            priceRUSD: 1,
            stockQuantity: 10,
            dailyProductionCapacity: 5,
          },
        ],
        customsCountryId: 0,
        infrastructure: 0.5,
      },
    ],
    goods: [{ id: 0, key: "grain", name: "Grain", unitLabel: "kg", category: "food" }],
    needTiers: [],
    projectTypes: [],
    technologyEraNames: [],
    technologyCatalog: [],
    trade: {
      enabled: false,
      routes: [],
      shipments: [],
      inTransitShipmentCount: 0,
      shipmentsTruncated: false,
      lastDay: null,
    },
    priceIndex: {
      baseDayIndex: 0,
      basket: [],
      worldValue: 100,
      coverage: 0,
      observations: [],
      monthOnMonthInflation: null,
      yearOnYearInflation: null,
    },
    currencies: [],
    valuationHistory: { months: [], years: [] },
    military: { enabled: false, wars: [], peaceOffers: [], armies: [], occupations: [] },
    diagnostics: { invalidActionCount: 0, invariantFailureCount: 0, recentWarnings: [] },
  };
}

function supervisorHarness(): {
  supervisor: WorkerSupervisor;
  scheduler: ManualScheduler;
  commands: WorkerCommand[];
  events: WorkerEvent[];
  errors: string[];
  timeouts: { readonly id: string | null; readonly type: string }[];
} {
  const scheduler = new ManualScheduler();
  const commands: WorkerCommand[] = [];
  const events: WorkerEvent[] = [];
  const errors: string[] = [];
  const timeouts: { id: string | null; type: string }[] = [];
  const supervisor = new WorkerSupervisor({
    send: (next) => commands.push(next),
    onEvent: (event) => events.push(event),
    onError: (message) => errors.push(message),
    onTimeout: (id, type) => timeouts.push({ id, type }),
    scheduler,
    readinessTimeoutMs: 1_000,
    commandTimeoutMs: 500,
    criticalTimeoutMs: 2_000,
  });
  return { supervisor, scheduler, commands, events, errors, timeouts };
}

describe("worker supervisor", () => {
  test("times out when READY never arrives and clears the timer on markReady", () => {
    const first = supervisorHarness();
    first.scheduler.advance(1_000);
    expect(first.timeouts).toEqual([{ id: null, type: "READY" }]);
    expect(first.scheduler.pending).toBe(0);

    const second = supervisorHarness();
    second.supervisor.markReady();
    second.scheduler.advance(1_000);
    expect(second.timeouts).toEqual([]);
  });

  test("correlates replies and drops duplicate or late command results", () => {
    const harness = supervisorHarness();
    harness.supervisor.markReady();
    expect(harness.supervisor.send(command("START", "start-1"))).toBe(true);
    expect(harness.commands).toHaveLength(1);

    harness.supervisor.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: "STATE",
      commandId: "start-1",
      running: true,
      speedDaysPerSecond: 1,
      achievedDaysPerSecond: 0,
    });
    expect(harness.events).toHaveLength(1);

    // Duplicate reply for an already-settled command is dropped.
    harness.supervisor.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: "STATE",
      commandId: "start-1",
      running: true,
      speedDaysPerSecond: 1,
      achievedDaysPerSecond: 0,
    });
    expect(harness.events).toHaveLength(1);

    // Timeout removes the pending command; a response that arrives afterward is stale.
    harness.supervisor.send(command("REQUEST_SNAPSHOT", "snap-1"));
    harness.scheduler.advance(500);
    expect(harness.timeouts).toEqual([{ id: "snap-1", type: "REQUEST_SNAPSHOT" }]);
    harness.supervisor.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: "SNAPSHOT",
      commandId: "snap-1",
      snapshot: validSnapshot(2),
    });
    expect(harness.events).toHaveLength(1);
  });

  test("accepts only strictly newer snapshots", () => {
    const harness = supervisorHarness();
    harness.supervisor.markReady();
    const incoming = (sequence: number): WorkerEvent => ({
      protocolVersion: PROTOCOL_VERSION,
      type: "SNAPSHOT",
      commandId: null,
      snapshot: validSnapshot(sequence),
    });
    harness.supervisor.receive(incoming(2));
    harness.supervisor.receive(incoming(2));
    harness.supervisor.receive(incoming(1));
    expect(harness.events).toHaveLength(1);
    harness.supervisor.receive(incoming(3));
    expect(harness.events).toHaveLength(2);
  });

  test("allows one critical operation and clears it on timeout", () => {
    const harness = supervisorHarness();
    harness.supervisor.markReady();
    expect(harness.supervisor.send(command("SAVE", "save-1"))).toBe(true);
    expect(harness.supervisor.hasPendingCritical).toBe(true);
    expect(harness.supervisor.send(command("LOAD", "load-blocked", { save: "x" }))).toBe(false);
    expect(harness.errors[0]).toMatch(/still pending/i);

    harness.scheduler.advance(2_000);
    expect(harness.supervisor.hasPendingCritical).toBe(false);
    expect(harness.supervisor.send(command("LOAD", "load-2", { save: "x" }))).toBe(true);
  });

  test("reset and dispose remove pending timers and permit a replacement instance", () => {
    const harness = supervisorHarness();
    harness.supervisor.markReady();
    harness.supervisor.send(command("STEP", "step-1", { ticks: 1 }));
    harness.supervisor.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: "SNAPSHOT",
      commandId: null,
      snapshot: validSnapshot(5),
    });
    expect(harness.events).toHaveLength(1);

    harness.supervisor.reset();
    expect(harness.supervisor.pendingCount).toBe(0);
    // A replacement worker starts its sequence at 1; the old high-water mark is cleared.
    harness.supervisor.receive({
      protocolVersion: PROTOCOL_VERSION,
      type: "SNAPSHOT",
      commandId: null,
      snapshot: validSnapshot(1),
    });
    expect(harness.events).toHaveLength(2);

    harness.supervisor.send(command("SAVE", "save-2"));
    harness.supervisor.dispose();
    harness.scheduler.advance(5_000);
    expect(harness.timeouts).toHaveLength(0);
    expect(harness.supervisor.pendingCount).toBe(0);
  });

  test("transport failure clears pending work so late timeouts cannot fire", () => {
    const harness = supervisorHarness();
    harness.supervisor.markReady();
    harness.supervisor.send(command("SAVE", "save-fail"));
    harness.supervisor.fail("worker crashed");
    expect(harness.supervisor.pendingCount).toBe(0);
    expect(harness.errors).toContain("worker crashed");
    harness.scheduler.advance(5_000);
    expect(harness.timeouts).toHaveLength(0);
  });
});

describe("snapshot protocol validation", () => {
  test("accepts a structurally valid snapshot", () => {
    expect(() =>
      parseWorkerEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "READY",
        snapshot: validSnapshot(1),
      }),
    ).not.toThrow();
  });

  test("rejects malformed nested UI data", () => {
    const cases: ((snapshot: SimulationSnapshot) => void)[] = [
      (snapshot) => {
        (snapshot.date as { label: string }).label = "";
      },
      (snapshot) => {
        (snapshot.countries[0] as { provinceIds: unknown }).provinceIds = "not-an-array";
      },
      (snapshot) => {
        (snapshot.provinceTable as unknown as { territoryTag: unknown[] }).territoryTag[0] = 7;
      },
      (snapshot) => {
        (snapshot.provinceTable as unknown as { countryId: unknown[] }).countryId[0] = -1;
      },
      (snapshot) => {
        (snapshot.markets[0] as { prices: unknown }).prices = [{}];
      },
      (snapshot) => {
        (snapshot.diagnostics as { recentWarnings: unknown }).recentWarnings = [1];
      },
      (snapshot) => {
        (snapshot as { achievedDaysPerSecond: unknown }).achievedDaysPerSecond = "fast";
      },
    ];
    for (const mutate of cases) {
      const snapshot = validSnapshot(1);
      mutate(snapshot);
      expect(() =>
        parseWorkerEvent({
          protocolVersion: PROTOCOL_VERSION,
          type: "READY",
          snapshot,
        }),
      ).toThrow(/snapshot/i);
    }
  });

  test("requires correlated command/reply fields and speed telemetry", () => {
    expect(() =>
      parseWorkerEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "STATE",
        running: true,
        speedDaysPerSecond: 1,
      }),
    ).toThrow();
    expect(() =>
      parseWorkerEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "ACTION_RESULT",
        actionId: "a",
        accepted: true,
        errors: [],
        snapshot: validSnapshot(1),
      }),
    ).toThrow();
  });
});
