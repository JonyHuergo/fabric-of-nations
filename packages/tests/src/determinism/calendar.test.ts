import {
  CAMPAIGN_BOUNDS,
  CAMPAIGN_TICKS,
  CAMPAIGN_TERMINAL_DAY_INDEX,
  VALID_DAY_INDEX_COUNT,
  civilDateToDayIndex,
  dayIndexToCivilDate,
  daysInMonth,
  daysInYear,
  elapsedDailyTransitions,
  formatCivilDate,
  formatDayIndex,
  isLeapYear,
  isProcessableDayIndex,
  isTerminalDayIndex,
  isValidDate,
  isValidDayIndex,
  remainingCampaignTicks,
  type Month,
} from "@century/sim";

describe("Gregorian calendar", () => {
  test("day index 0 is 1900-01-01", () => {
    expect(dayIndexToCivilDate(0)).toEqual({ year: 1900, month: 1, day: 1 });
    expect(civilDateToDayIndex(1900, 1, 1)).toBe(0);
    expect(formatDayIndex(0)).toBe("1900-01-01");
  });

  test("applies the Gregorian 100/400-year leap rule", () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(1904)).toBe(true);
    expect(isLeapYear(1996)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2004)).toBe(true);
    expect(daysInYear(1900)).toBe(365);
    expect(daysInYear(1904)).toBe(366);
  });

  test("knows month lengths including century and leap Februaries", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(1904, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(31);
    expect(daysInMonth(1900, 4)).toBe(30);
    expect(daysInMonth(1900, 12)).toBe(31);
  });

  test("maps year transitions and the GDD boundary dates exactly", () => {
    expect(civilDateToDayIndex(1900, 12, 31)).toBe(364);
    expect(civilDateToDayIndex(1901, 1, 1)).toBe(365);
    expect(dayIndexToCivilDate(364)).toEqual({ year: 1900, month: 12, day: 31 });
    expect(dayIndexToCivilDate(365)).toEqual({ year: 1901, month: 1, day: 1 });

    expect(civilDateToDayIndex(1900, 2, 28)).toBe(58);
    expect(civilDateToDayIndex(1900, 3, 1)).toBe(59);
    expect(civilDateToDayIndex(1996, 2, 29)).toBe(35_122);
    expect(civilDateToDayIndex(1999, 12, 31)).toBe(36_523);
    expect(civilDateToDayIndex(2000, 1, 1)).toBe(36_524);
    expect(dayIndexToCivilDate(35_122)).toEqual({ year: 1996, month: 2, day: 29 });
    expect(dayIndexToCivilDate(36_523)).toEqual({ year: 1999, month: 12, day: 31 });
    expect(dayIndexToCivilDate(36_524)).toEqual({ year: 2000, month: 1, day: 1 });
  });

  test("round-trips every valid day index exactly once", () => {
    const seen = new Set<string>();
    let transitions = 0;
    let duplicates = 0;
    let roundTripMismatches = 0;
    for (let dayIndex = 0; dayIndex <= CAMPAIGN_TERMINAL_DAY_INDEX; dayIndex += 1) {
      const date = dayIndexToCivilDate(dayIndex);
      const key = formatCivilDate(date);
      if (seen.has(key)) duplicates += 1;
      seen.add(key);
      if (civilDateToDayIndex(date.year, date.month, date.day) !== dayIndex) {
        roundTripMismatches += 1;
      }
      if (dayIndex > 0) transitions += 1;
    }
    expect({
      uniqueDates: seen.size,
      duplicates,
      roundTripMismatches,
      transitions,
    }).toEqual({
      uniqueDates: VALID_DAY_INDEX_COUNT,
      duplicates: 0,
      roundTripMismatches: 0,
      transitions: CAMPAIGN_TICKS,
    });
  });

  test("contains exactly 36,524 processed campaign days and 36,525 valid indices", () => {
    let days = 0;
    let leapYears = 0;
    for (let year = 1900; year < 2000; year += 1) {
      days += daysInYear(year);
      if (isLeapYear(year)) leapYears += 1;
    }
    expect(leapYears).toBe(24);
    expect(days).toBe(36_524);
    expect(days).toBe(CAMPAIGN_TICKS);
    expect(CAMPAIGN_BOUNDS).toEqual({
      firstDayIndex: 0,
      terminalDayIndex: 36_524,
      processedDays: 36_524,
      validDayIndices: 36_525,
    });
  });

  test("distinguishes valid indices, processable days, and elapsed transitions", () => {
    expect(isValidDayIndex(0)).toBe(true);
    expect(isValidDayIndex(36_523)).toBe(true);
    expect(isValidDayIndex(36_524)).toBe(true);
    expect(isValidDayIndex(36_525)).toBe(false);
    expect(isValidDayIndex(-1)).toBe(false);
    expect(isValidDayIndex(1.5)).toBe(false);

    expect(isProcessableDayIndex(36_523)).toBe(true);
    expect(isProcessableDayIndex(36_524)).toBe(false);
    expect(isTerminalDayIndex(36_524)).toBe(true);
    expect(isTerminalDayIndex(36_523)).toBe(false);

    expect(remainingCampaignTicks(0)).toBe(CAMPAIGN_TICKS);
    expect(remainingCampaignTicks(36_523)).toBe(1);
    expect(remainingCampaignTicks(36_524)).toBe(0);
    expect(elapsedDailyTransitions(0)).toBe(0);
    expect(elapsedDailyTransitions(1)).toBe(1);
    expect(elapsedDailyTransitions(36_524)).toBe(36_524);
  });

  test("rejects invalid dates and out-of-campaign dates instead of wrapping", () => {
    expect(isValidDate(1900, 2, 29)).toBe(false);
    expect(isValidDate(1904, 2, 29)).toBe(true);
    expect(isValidDate(1899, 12, 31)).toBe(false);
    expect(isValidDate(2000, 1, 2)).toBe(false);
    expect(() => civilDateToDayIndex(1900, 2, 29)).toThrow(RangeError);
    expect(() => civilDateToDayIndex(1899, 12, 31)).toThrow(RangeError);
    expect(() => civilDateToDayIndex(2000, 1, 2)).toThrow(RangeError);
    expect(() => civilDateToDayIndex(1900, 13 as Month, 1)).toThrow(RangeError);
    expect(() => dayIndexToCivilDate(36_525)).toThrow(RangeError);
    expect(() => dayIndexToCivilDate(1.5)).toThrow(RangeError);
  });
});
