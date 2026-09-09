package com.superfunteam.walky;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

/** Recalculate cached, confirmed walks against the current local day, including after midnight. */
final class WidgetStats {
  final boolean walkedToday;
  final int streak;
  final int weekCount;
  final int total;

  WidgetStats(Set<String> savedDates, LocalDate today) {
    Set<LocalDate> dates = new HashSet<>();
    for (String saved : savedDates) {
      try {
        LocalDate date = LocalDate.parse(saved);
        if (!date.isAfter(today)) dates.add(date);
      } catch (java.time.format.DateTimeParseException ignored) {
      }
    }
    walkedToday = dates.contains(today);
    total = dates.size();
    LocalDate cursor = walkedToday ? today : today.minusDays(1);
    int consecutive = 0;
    while (dates.contains(cursor)) {
      consecutive++;
      cursor = cursor.minusDays(1);
    }
    streak = consecutive;
    LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
    int count = 0;
    for (LocalDate date : dates) if (!date.isBefore(monday)) count++;
    weekCount = count;
  }
}
