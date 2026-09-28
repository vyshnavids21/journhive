import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { PostsService } from '../services/posts.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { confirmDelete } from '../shared/confirm-dialog';
import { formatDateRange } from '../shared/date-range';
import { TripStatus, statusLabel, tripTiming } from '../shared/trip-timing';

type TripFilter = 'all' | TripStatus;
type TripSort = 'newest' | 'oldest' | 'name' | 'places';

const PREFS_KEY = 'journhive.tripsView';

@Component({
  selector: 'app-trip-dashboard',
  templateUrl: './trip-dashboard.component.html',
  styleUrls: ['./trip-dashboard.component.scss']
})
export class TripDashboardComponent implements OnInit {

  totalPosts = 0;
  pageSize = 12;
  pageSizeOptions = [12, 24, 36, 48];
  filteredPageSizeOptions: number[] = [];
  currentPage = 0;
  paginatedPosts: any[] = [];
  userId: string = '';
  public tripListArray: any[] = [];
  isLoading: boolean = true;

  filter: TripFilter = 'all';
  sort: TripSort = 'newest';
  filteredTrips: any[] = [];
  counts: Record<TripFilter, number> = { all: 0, upcoming: 0, ongoing: 0, completed: 0 };
  stats = { places: 0, days: 0 };

  readonly filters: { key: TripFilter, label: string }[] = [
    { key: 'all', label: 'All trips' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'ongoing', label: 'Happening now' },
    { key: 'completed', label: 'Completed' },
  ];
  readonly sorts: { key: TripSort, label: string, hint: string, icon: string }[] = [
    { key: 'newest', label: 'Newest first', hint: 'Most recent trips on top', icon: 'update' },
    { key: 'oldest', label: 'Oldest first', hint: 'Where it all began', icon: 'history' },
    { key: 'name', label: 'Name (A–Z)', hint: 'Alphabetical by destination', icon: 'sort_by_alpha' },
    { key: 'places', label: 'Most places', hint: 'Your busiest journeys', icon: 'place' },
  ];

  // Custom sort dropdown state
  sortOpen = false;
  sortIndex = 0;
  @ViewChild('sortTrigger') sortTrigger?: ElementRef<HTMLButtonElement>;

  readonly formatRange = formatDateRange;

  constructor(private postsService: PostsService, private router: Router, private toastr: ToastrService) { }

  ngOnInit(): void {
    this.restorePrefs();
    this.fetchPosts();
  }

  fetchPosts() {
    this.isLoading = true;
    this.postsService.getUserId().subscribe((id) => {
      if (!id) {
        this.isLoading = false;
        return;
      }

      this.userId = id;

      // First fetch all trips for this user
      this.postsService.getTripByCreatorId(this.userId).subscribe((tripData) => {
        const trips = tripData.trips || [];

        // Then fetch all posts for this user to calculate travel spot counts per trip
        this.postsService.getPostsByCreatorId(this.userId).subscribe((postData) => {
          const posts = postData.posts || [];

          // Attach postsCount (and derived date info) to each trip
          this.tripListArray = trips.map((trip: any) => {
            const tripId = trip.id || trip._id;
            const spotsCount = posts.filter((post: any) => post.tripId === tripId).length;
            return this.decorate({
              ...trip,
              postsCount: spotsCount
            });
          });

          this.totalPosts = this.tripListArray.length;
          this.updateStats();
          this.applyView();
          this.isLoading = false;
        }, () => this.onLoadError());
      }, () => this.onLoadError());
    });
  }

  private onLoadError() {
    this.isLoading = false;
    this.toastr.error('We couldn\'t load your trips. Please refresh to try again.', 'Something went wrong');
  }

  async deletePost(id: string) {
    const confirmed = await confirmDelete('Delete this trip?', 'The trip will be permanently removed. This can\'t be undone.');
    if (!confirmed) {
      return;
    }
    this.postsService.deleteTrip(id).subscribe(() => {
      this.tripListArray = this.tripListArray.filter(trip => (trip.id || trip._id) !== id);
      this.totalPosts = this.tripListArray.length;
      this.updateStats();
      this.applyView();
      this.toastr.success('The trip has been deleted.', 'Deleted');
    }, () => this.toastr.error('The trip couldn\'t be deleted. Please try again.', 'Delete failed'));
  }

  viewTrip(trip: any) {
    const tripId = trip.id || trip._id;
    if (!tripId) {
      return;
    }
    this.router.navigate(['/trips', tripId], {
      queryParams: { tripName: trip.destination}
    });
  }

  // ---- Filtering & sorting ----

  setFilter(filter: TripFilter) {
    this.filter = filter;
    this.currentPage = 0;
    this.savePrefs();
    this.applyView();
  }

  setSort(sort: TripSort) {
    this.sort = sort;
    this.currentPage = 0;
    this.savePrefs();
    this.applyView();
  }

  get currentSort() {
    return this.sorts.find(s => s.key === this.sort) || this.sorts[0];
  }

  toggleSort(event?: Event) {
    event?.stopPropagation();
    this.sortOpen ? this.closeSort() : this.openSort();
  }

  private openSort() {
    this.sortIndex = Math.max(0, this.sorts.findIndex(s => s.key === this.sort));
    this.sortOpen = true;
  }

  closeSort(refocus = false) {
    this.sortOpen = false;
    if (refocus) {
      this.sortTrigger?.nativeElement.focus();
    }
  }

  chooseSort(sort: TripSort) {
    this.setSort(sort);
    this.closeSort(true);
  }

  // Listbox keyboard support: arrows move, Enter/Space choose, Escape/Tab close
  onSortKeydown(event: KeyboardEvent) {
    const last = this.sorts.length - 1;
    if (!this.sortOpen) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        this.openSort();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown': this.sortIndex = this.sortIndex >= last ? 0 : this.sortIndex + 1; break;
      case 'ArrowUp': this.sortIndex = this.sortIndex <= 0 ? last : this.sortIndex - 1; break;
      case 'Home': this.sortIndex = 0; break;
      case 'End': this.sortIndex = last; break;
      case 'Enter':
      case ' ': this.chooseSort(this.sorts[this.sortIndex].key); break;
      case 'Escape': this.closeSort(true); break;
      case 'Tab': this.closeSort(); return;
      default: return;
    }
    event.preventDefault();
  }

  @HostListener('document:click')
  onDocumentClick() {
    if (this.sortOpen) {
      this.closeSort();
    }
  }

  get filterLabel(): string {
    return this.filters.find(f => f.key === this.filter)?.label.toLowerCase() || 'trips';
  }

  private applyView() {
    const byFilter = this.filter === 'all'
      ? [...this.tripListArray]
      : this.tripListArray.filter(trip => trip.status === this.filter);

    const compare: Record<TripSort, (a: any, b: any) => number> = {
      newest: (a, b) => b.startTime - a.startTime,
      oldest: (a, b) => a.startTime - b.startTime,
      name: (a, b) => (a.destination || '').localeCompare(b.destination || ''),
      places: (a, b) => (b.postsCount || 0) - (a.postsCount || 0) || b.startTime - a.startTime,
    };
    this.filteredTrips = byFilter.sort(compare[this.sort]);

    this.counts = { all: this.tripListArray.length, upcoming: 0, ongoing: 0, completed: 0 };
    this.tripListArray.forEach(trip => this.counts[trip.status as TripStatus]++);

    this.disablePageSizeOptions();
    this.updatePaginatedPosts();
  }

  private restorePrefs() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PREFS_KEY) || '{}');
      if (this.filters.some(f => f.key === saved.filter)) {
        this.filter = saved.filter;
      }
      if (this.sorts.some(s => s.key === saved.sort)) {
        this.sort = saved.sort;
      }
    } catch { /* storage unavailable — use defaults */ }
  }

  private savePrefs() {
    try {
      sessionStorage.setItem(PREFS_KEY, JSON.stringify({ filter: this.filter, sort: this.sort }));
    } catch { /* storage unavailable */ }
  }

  // ---- Derived trip info ----

  // Adds status, duration and a relative-time hint ("Starts in 12 days") to a trip
  private decorate(trip: any) {
    return { ...trip, ...tripTiming(trip.startDate, trip.endDate) };
  }

  readonly statusLabel = statusLabel;

  private updateStats() {
    this.stats = this.tripListArray.reduce((acc, trip) => {
      acc.places += trip.postsCount || 0;
      acc.days += trip.days || 0;
      return acc;
    }, { places: 0, days: 0 });
  }

  // ---- Pagination ----

  onChangePage(event: PageEvent) {
    if (event.pageSize !== this.pageSize) {
      this.pageSize = event.pageSize;
      this.currentPage = 0;
    } else {
      this.currentPage = event.pageIndex;
    }
    this.updatePaginatedPosts();
  }

  updatePaginatedPosts() {
    // Step back a page if deleting emptied the current one
    const lastPage = Math.max(0, Math.ceil(this.filteredTrips.length / (this.pageSize || 1)) - 1);
    this.currentPage = Math.min(this.currentPage, lastPage);
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedPosts = this.filteredTrips.slice(startIndex, endIndex);
  }

  disablePageSizeOptions() {
    const total = this.filteredTrips.length;
    const idealMaxOption = this.pageSizeOptions.find(option => option >= total);

    if (total < 5) {
      this.filteredPageSizeOptions = [this.pageSizeOptions[0]];
    } else if (idealMaxOption) {
      this.filteredPageSizeOptions = this.pageSizeOptions.filter(
        (option) => option <= idealMaxOption
      );
    } else {
      this.filteredPageSizeOptions = [...this.pageSizeOptions];
    }

    if (!this.filteredPageSizeOptions.includes(this.pageSize)) {
      this.pageSize = this.filteredPageSizeOptions[0];
    }
  }

}
