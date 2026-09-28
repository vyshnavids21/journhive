import { Injectable } from '@angular/core';
import { MatDateFormats, NativeDateAdapter } from '@angular/material/core';

// Datepicker inputs show and accept dates as DD/MM/YYYY (e.g. 24/12/2026).
@Injectable()
export class AppDateAdapter extends NativeDateAdapter {

  override format(date: Date, displayFormat: Object): string {
    if (displayFormat === 'input') {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}/${date.getFullYear()}`;
    }
    return super.format(date, displayFormat);
  }

  // Accepts D/M/YYYY with "/", "-" or "." separators; anything else is invalid
  override parse(value: any): Date | null {
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (!match) {
        return value.trim() ? this.invalid() : null;
      }
      const [, d, m, y] = match.map(Number);
      const date = new Date(y, m - 1, d);
      // Reject impossible dates like 31/02/2026
      return date.getDate() === d && date.getMonth() === m - 1 ? date : this.invalid();
    }
    return super.parse(value);
  }

  // Weeks start on Monday, matching the trip planner's month view
  override getFirstDayOfWeek(): number {
    return 1;
  }
}

export const APP_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: 'input' },
  display: {
    dateInput: 'input',
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};
