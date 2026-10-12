/* NSW holidays: independent of accounts and event storage. */
(() => {
  "use strict";
  const HOLIDAY_SOURCE_ID = "nsw-public-holidays";
  const HOLIDAY_SOURCE_URL = "https://www.nsw.gov.au/about-nsw/public-holidays";
  // Standard NSW holiday rules, checked 12 October 2026, generate each year
  // as it is viewed. Only confirmed one-off declarations belong in this table.
  // The August Bank Holiday is not a statewide public holiday.
  const FIRST_HOLIDAY_YEAR = 2026;
  const DECLARED_EXTRA_HOLIDAYS = [
    ["2026-04-27", "Anzac Day (additional holiday)"],
    ["2027-04-26", "Anzac Day (additional holiday)"],
  ];

  const pad = (n) => String(n).padStart(2, "0");
  // UTC arithmetic keeps date-only holiday calculations independent of DST.
  const holidayDate = (year, month, day) =>
    new Date(Date.UTC(year, month - 1, day, 12));
  const holidayDateString = (date) =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  function shiftedHolidayDate(date, days) {
    const shifted = new Date(date);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted;
  }
  function nthMonday(year, month, occurrence) {
    const first = holidayDate(year, month, 1);
    return holidayDate(
      year,
      month,
      1 + ((8 - first.getUTCDay()) % 7) + 7 * (occurrence - 1),
    );
  }
  function easterSunday(year) {
    // Oudin's Gregorian computus, documented by the US Naval Observatory:
    // https://aa.usno.navy.mil/faq/easter
    const floor = Math.floor;
    const century = floor(year / 100);
    const cycle = year % 19;
    const correction = floor((century - 17) / 25);
    let epact =
      (century -
        floor(century / 4) -
        floor((century - correction) / 3) +
        19 * cycle +
        15) %
      30;
    epact -=
      floor(epact / 28) *
      (1 -
        floor(epact / 28) * floor(29 / (epact + 1)) * floor((21 - cycle) / 11));
    const weekday =
      (year + floor(year / 4) + epact + 2 - century + floor(century / 4)) % 7;
    const difference = epact - weekday;
    const month = 3 + floor((difference + 40) / 44);
    const day = difference + 28 - 31 * floor(month / 4);
    return holidayDate(year, month, day);
  }
  function holidaysForYear(year) {
    if (!Number.isInteger(year) || year < FIRST_HOLIDAY_YEAR) return [];
    const holidays = [];
    const add = (date, title) =>
      holidays.push([holidayDateString(date), title]);
    const newYear = holidayDate(year, 1, 1);
    add(newYear, "New Year's Day");
    if ([0, 6].includes(newYear.getUTCDay())) {
      add(
        shiftedHolidayDate(newYear, newYear.getUTCDay() === 6 ? 2 : 1),
        "New Year's Day (additional holiday)",
      );
    }
    const australiaDay = holidayDate(year, 1, 26);
    // Australia Day moves to Monday when the 26th is on a weekend.
    add(
      shiftedHolidayDate(
        australiaDay,
        australiaDay.getUTCDay() === 6
          ? 2
          : australiaDay.getUTCDay() === 0
            ? 1
            : 0,
      ),
      "Australia Day",
    );
    const easter = easterSunday(year);
    add(shiftedHolidayDate(easter, -2), "Good Friday");
    add(shiftedHolidayDate(easter, -1), "Easter Saturday");
    add(easter, "Easter Sunday");
    add(shiftedHolidayDate(easter, 1), "Easter Monday");
    add(holidayDate(year, 4, 25), "Anzac Day");
    add(nthMonday(year, 6, 2), "King's Birthday");
    add(nthMonday(year, 10, 1), "Labour Day");
    const christmas = holidayDate(year, 12, 25);
    const boxingDay = holidayDate(year, 12, 26);
    add(christmas, "Christmas Day");
    add(boxingDay, "Boxing Day");
    // Allocate additional Christmas/Boxing weekdays without colliding with
    // the actual 25th/26th or an already allocated additional holiday.
    const occupied = new Set([
      holidayDateString(christmas),
      holidayDateString(boxingDay),
    ]);
    for (const [date, title] of [
      [christmas, "Christmas Day"],
      [boxingDay, "Boxing Day"],
    ]) {
      if (![0, 6].includes(date.getUTCDay())) continue;
      let observed = shiftedHolidayDate(date, date.getUTCDay() === 6 ? 2 : 1);
      while (
        [0, 6].includes(observed.getUTCDay()) ||
        occupied.has(holidayDateString(observed))
      ) {
        observed = shiftedHolidayDate(observed, 1);
      }
      add(observed, `${title} (additional holiday)`);
      occupied.add(holidayDateString(observed));
    }
    holidays.push(
      ...DECLARED_EXTRA_HOLIDAYS.filter(([date]) =>
        date.startsWith(`${year}-`),
      ),
    );
    return holidays.sort(
      (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
    );
  }
  function publicHolidayEvents(fetchInfo) {
    const currentYear = new Date().getFullYear();
    // Also keep this and next year's holidays available for Coming up.
    const years = new Set([currentYear, currentYear + 1]);
    for (
      let year = fetchInfo.start.getFullYear();
      year <= new Date(fetchInfo.end.getTime() - 1).getFullYear();
      year++
    ) {
      years.add(year);
    }
    return [...years].flatMap(holidaysForYear).map(([date, title]) => ({
      // Easter and Anzac Day can share a date; names keep their IDs distinct.
      id: `nsw-public-holiday-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title,
      start: date,
      end: holidayDateString(
        shiftedHolidayDate(new Date(date + "T12:00:00Z"), 1),
      ),
      allDay: true,
      editable: false,
      startEditable: false,
      durationEditable: false,
      backgroundColor: "#9b5f2d",
      borderColor: "#9b5f2d",
      extendedProps: {
        location: "New South Wales",
        notes: `Statewide NSW public holiday.\nCalculated from current NSW rules, checked 12 October 2026.\nSource: ${HOLIDAY_SOURCE_URL}\nFuture law changes and new one-off declarations require an update.\nThis reference entry cannot be edited or moved.`,
      },
    }));
  }

  window.CalendarHolidays = {
    sourceId: HOLIDAY_SOURCE_ID,
    events: publicHolidayEvents,
  };
})();
