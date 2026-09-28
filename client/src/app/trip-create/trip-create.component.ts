import { Component, DoCheck, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Trip } from '../models/trip.model';
import { PostsService } from '../services/posts.service';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { readImageSize } from '../shared/image-url';
import { formatDateRange } from '../shared/date-range';
import { TripTiming, dayStart, statusLabel, tripTiming } from '../shared/trip-timing';

interface CalendarCell {
  time: number;
  day: number;
  inMonth: boolean;
  today: boolean;
  start: boolean;
  end: boolean;
  range: boolean;
  preview: boolean;
  label: string;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

@Component({
  selector: 'app-trip-create',
  templateUrl: './trip-create.component.html',
  styleUrls: ['./trip-create.component.scss']
})
export class TripCreateComponent implements OnInit, DoCheck {
  public trip: Trip = { id: '', destination: '', startDate: null, endDate: null, coverPhoto: null, creatorId: '', skipImage: false};
  public creatorId = '';
  public imagePreview: string | ArrayBuffer | null = null;
  selectedImage: File | null = null;
  public mode = 'create';
  public tripId: string | null = null;
  isDragging = false;
  saving = false;

  // Real pixel size of the chosen photo, shown on the preview; recommendedWidth is used by the photo tips
  imageSize: { width: number, height: number } | null = null;
  readonly recommendedWidth = 1920;

  constructor(private router: Router, private postsService: PostsService, private route: ActivatedRoute,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    this.postsService.getUserId().subscribe((id) => {
      this.creatorId = id || '';
    })
    this.route.paramMap.subscribe(paramMap => {
      this.tripId = paramMap.get('tripId');
      this.mode = this.tripId ? 'edit' : 'create';
      if (this.tripId) {
        this.postsService.getTripById(this.tripId).subscribe(tripData => { //fetching trip details to edit trip. Only used in edit mode.
          this.trip = {
            id: tripData.id,
            destination: tripData.destination,
            startDate: tripData.startDate ? new Date(tripData.startDate) : null,
            endDate: tripData.endDate ? new Date(tripData.endDate) : null,
            skipImage: tripData.skipImage,
            coverPhoto: tripData.coverPhoto
          };
          this.intendedLength = this.tripLength;

          this.imagePreview =
            typeof tripData.coverPhoto === 'string' ? tripData.coverPhoto : null;
          this.measureImage(this.imagePreview);
        });
      }
    });
  }

  private measureImage(src: string | ArrayBuffer | null) {
    this.imageSize = null;
    if (typeof src !== 'string' || !src) {
      return;
    }
    readImageSize(src)
      .then(size => { if (this.imagePreview === src) { this.imageSize = size; } })
      .catch(() => { this.imageSize = null; });
  }

  // Inclusive trip length shown under the date fields
  get tripLength(): number {
    return this.trip.startDate && this.trip.endDate ? tripTiming(this.trip.startDate, this.trip.endDate).days : 0;
  }

  // Editing goes back to the trip itself; creating goes back to the list
  cancelClick() {
    if (this.mode === 'edit' && this.tripId) {
      this.router.navigate(['/trips', this.tripId], { queryParams: { tripName: this.trip.destination || null } });
    } else {
      this.router.navigate(['/trips']);
    }
  }

  readonly statusLabel = statusLabel;
  readonly quickLengths = [
    { label: 'Weekend', days: 3, icon: 'weekend' },
    { label: '1 week', days: 7, icon: 'date_range' },
    { label: '10 days', days: 10, icon: 'luggage' },
    { label: '2 weeks', days: 14, icon: 'explore' },
  ];

  // Required steps completed (destination + dates), for the readiness bar
  get readyCount(): number {
    return (this.trip.destination ? 1 : 0) + (this.trip.startDate && this.trip.endDate ? 1 : 0);
  }

  // Sets the return date so the trip lasts `days` (inclusive)
  setLength(days: number) {
    if (!this.trip.startDate) {
      return;
    }
    const start = new Date(this.trip.startDate);
    this.trip.endDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1);
    this.intendedLength = days;
  }

  // The length the user chose (via a quick length or the return date). Moving the departure keeps it;
  // otherwise an invalid range clears the return date.
  private intendedLength = 0;
  onStartChange() {
    if (this.intendedLength && this.trip.endDate) {
      this.setLength(this.intendedLength);
    } else if (this.trip.startDate && this.trip.endDate && new Date(this.trip.endDate) < new Date(this.trip.startDate)) {
      this.trip.endDate = null;
    }
  }

  onEndChange() {
    this.intendedLength = this.tripLength;
  }

  get timing(): TripTiming {
    return tripTiming(this.trip.startDate, this.trip.endDate);
  }

  // ---- Month calendar (an alternative way to pick the same two dates) ----

  readonly weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  viewMonth = startOfMonth(new Date());
  hoverTime = 0;
  calendarCells: CalendarCell[] = [];
  private calendarKey = '';
  private followedStart = 0;

  get monthLabel(): string {
    return this.viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  shiftMonth(delta: number) {
    this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + delta, 1);
  }

  // First click sets the departure; the next sets the return (or moves the departure if earlier)
  pickDay(time: number) {
    const day = new Date(time);
    const start = dayStart(this.trip.startDate);
    if (!start || this.trip.endDate) {
      this.trip.startDate = day;
      this.trip.endDate = null;
      this.intendedLength = 0;
    } else if (time < start) {
      this.trip.startDate = day;
    } else {
      this.trip.endDate = day;
      this.onEndChange();
    }
  }

  // Rebuilds the calendar only when something it shows has changed
  ngDoCheck(): void {
    const start = dayStart(this.trip.startDate);
    const end = dayStart(this.trip.endDate);

    // Follow the departure month when it's changed from the date fields
    if (start && start !== this.followedStart) {
      this.followedStart = start;
      this.viewMonth = startOfMonth(new Date(start));
    }

    const choosingEnd = !!start && !end;
    const hover = choosingEnd ? this.hoverTime : 0;
    const key = `${this.viewMonth.getTime()}:${start}:${end}:${hover}`;
    if (key === this.calendarKey) {
      return;
    }
    this.calendarKey = key;

    const today = dayStart(Date.now());
    const first = this.viewMonth;
    const offset = (first.getDay() + 6) % 7; // Monday-first grid
    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
      const time = date.getTime();
      const rangeEnd = end || (hover > start ? hover : 0);
      cells.push({
        time,
        day: date.getDate(),
        inMonth: date.getMonth() === first.getMonth(),
        today: time === today,
        start: time === start,
        end: time === end,
        range: !!end && time > start && time < end,
        preview: !end && !!rangeEnd && time > start && time <= rangeEnd,
        label: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      });
    }
    // Drop a trailing week that's entirely next month
    this.calendarCells = cells.slice(35).every(c => !c.inMonth) ? cells.slice(0, 35) : cells;
  }

  get previewDates(): string {
    return this.trip.startDate || this.trip.endDate ? formatDateRange(this.trip.startDate, this.trip.endDate) : '';
  }

  // Same effect as the old "continue without a cover photo" option: clears the photo (and on edit, the saved cover)
  removePhoto() {
    this.onCheckedSkipImage({ checked: true });
  }

  addTrip() {
    if(!this.trip.destination || !this.trip.startDate || !this.trip.endDate || this.saving) {
      return;
    }
    this.saving = true;
    const tripData = new FormData();
    tripData.append('destination', this.trip.destination);
    tripData.append('startDate', this.trip.startDate ? this.trip.startDate.toDateString() : '');
    tripData.append('endDate', this.trip.endDate? this.trip.endDate.toDateString() : '')
    tripData.append('creatorId', this.creatorId); //getting from login/signup page
    tripData.append('skipImage', this.trip.skipImage.toString());

    if (this.mode === 'create') {
      // For create: only send file if present; server will store null when no file
      if (this.selectedImage) {
        tripData.append('coverPhoto', this.selectedImage);
      }

      this.postsService.addTrip(tripData).subscribe((res) => {
      this.saving = false;
      this.toastr.success(`${this.trip.destination} has been added to your trips.`, 'Trip created');
      this.trip.destination = '';
      this.trip.startDate = null;
      this.trip.endDate = null;
      this.selectedImage = null;
      this.imagePreview = null;
      this.trip.skipImage = false;
      this.router.navigate(['/trips']);
       
    }, (err) => {
      this.saving = false;
      this.toastr.error('The trip couldn\'t be created. Please try again.', 'Something went wrong');
    });
  } else if (this.mode === 'edit') {
    if (!this.tripId) {
      this.saving = false;
      return;
    }
    // For edit: allow clearing or replacing image
    if (this.trip.skipImage) {
      tripData.append('coverPhoto', '');
    } else if (this.selectedImage) {
      tripData.append('coverPhoto', this.selectedImage);
    }

    this.postsService.updateTrip(this.tripId, tripData).subscribe(
      (res) => {
        this.saving = false;
        this.toastr.success('Your changes have been saved.', 'Trip updated');
        this.router.navigate(['/trips']);
      },
      (err) => {
        this.saving = false;
        this.toastr.error('Your changes couldn\'t be saved. Please try again.', 'Something went wrong');
      }
    );
  }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.setImageFile(file);
    }
    input.value = ''; // allow re-selecting the same file
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.setImageFile(file);
    }
  }

  private setImageFile(file: File) {
    this.selectedImage = file;
    this.trip.skipImage = false;
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview = reader.result;
      this.measureImage(this.imagePreview);
    };
    reader.readAsDataURL(file);
  }

  onCheckedSkipImage(event: any) {
    this.trip.skipImage = event.checked;
    if(this.trip.skipImage) {
      this.imagePreview = null;
      this.selectedImage = null;
      this.imageSize = null;
    }
  }

}
