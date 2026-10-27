import {
  PROTOCOL_VERSION,
  WorkerSupervisor,
  parseWorkerEvent,
  type SimulationSnapshot,
  type WorkerCommand,
  type WorkerEvent,
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
    constructionEnabled: false,
    countries: [
      {
        id: 0,
        tag: "USA",
        name: "United States",
        regionIds: [0],
        fiscal: {
          incomeTaxRate: 0.1,
          incomeTaxAllowanceSUSDPerYear: 0,
          welfareBudgetSUSDPerYear: 0,
          welfareMaxWealthLevel: 99,
          businessProfitTaxRate: 0,
          reserveTargetSUSD: 0,
        },
        treasuryCashSUSD: 100,
        debtEnabled: false,
        debtOutstandingPrincipalSUSD: 0,
        debtInterestPayableSUSD: 0,
        debtPolicy: {
          enabled: false,
          refinanceOnMaturity: false,
          maxOutstandingPrincipalSUSD: 0,
          creditorKind: "country",
          creditorId: 0,
          creditorLabel: "Country 0",
          annualCouponRate: 0,
          termDays: 365,
          arrearsGraceDays: 0,
          creditorCashSUSD: 0,
          headroomSUSD: 0,
        },
        debtContracts: [],
        population: 100,
        workingAgePopulation: 60,
        employedWorkers: 50,
        householdCashSUSD: 10,
        estimatedDailyWageBaseSUSD: 1,
        estimatedDailyTaxableWageBaseSUSD: 1,
        estimatedWageEarningBlockCount: 1,
        businessTaxBaseMonthToDateSUSD: 0,
        budgetMonthToDate: {
          welfareRequestedSUSD: 0,
          welfareShortfallSUSD: 0,
          businessTaxAssessedSUSD: 0,
          businessTaxUncollectedSUSD: 0,
          debtIssuedSUSD: 0,
          principalRepaidSUSD: 0,
          interestPaidSUSD: 0,
          unfinancedRequirementSUSD: 0,
          constructionSpentSUSD: 0,
          constructionWrittenOffSUSD: 0,
          constructionMaterialsSpentSUSD: 0,
          subsidyRequestedSUSD: 0,
          subsidyShortfallSUSD: 0,
          publicEnterpriseSupportSUSD: 0,
          businessTaxBaseMonthToDateSUSD: 0,
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
          totalSpentSUSD: 0,
          totalWrittenOffSUSD: 0,
        },
        constructionLabor: { idleWorkers: 0, dailyWageSUSD: 0 },
        constructionInProgressSUSD: 0,
        publicCapitalSUSD: 0,
        industrialPolicy: {
          sectors: [
            { index: 0, key: "agriculture", label: "Agriculture", subsidyRate: 0, estimatedDailyOutputValueSUSD: 0 },
            { index: 1, key: "food-processing", label: "Food processing", subsidyRate: 0, estimatedDailyOutputValueSUSD: 0 },
            { index: 2, key: "textiles", label: "Textiles", subsidyRate: 0, estimatedDailyOutputValueSUSD: 0 },
            { index: 3, key: "manufacturing", label: "Manufacturing", subsidyRate: 0, estimatedDailyOutputValueSUSD: 0 },
            { index: 4, key: "storage", label: "Storage", subsidyRate: 0, estimatedDailyOutputValueSUSD: 0 },
          ],
          requestedMonthToDateSUSD: 0,
          paidMonthToDateSUSD: 0,
          shortfallMonthToDateSUSD: 0,
        },
        publicEnterprises: [],
      },
    ],
    regions: [
      { id: 0, key: "r0", name: "Region", countryId: 0, marketId: 0, population: 100, buildingCount: 1 },
    ],
    markets: [
      {
        id: 0,
        label: "Market",
        regionIds: [0],
        prices: [
          {
            goodId: 0,
            goodKey: "grain",
            goodName: "Grain",
            unitLabel: "kg",
            priceSUSD: 1,
            stockQuantity: 10,
            dailyProductionCapacity: 5,
          },
        ],
      },
    ],
    goods: [{ id: 0, key: "grain", name: "Grain", unitLabel: "kg", category: "food" }],
    needTiers: [],
    projectTypes: [],
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
        (snapshot.countries[0] as { regionIds: unknown }).regionIds = "not-an-array";
      },
      (snapshot) => {
        (snapshot.regions[0] as { key: unknown }).key = 7;
      },
      (snapshot) => {
        (snapshot.regions[0] as { countryId: unknown }).countryId = -1;
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
