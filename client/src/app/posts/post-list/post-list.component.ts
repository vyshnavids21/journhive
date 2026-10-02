import {
  Component,
  OnInit,
  Input,
  ViewChild,
  ElementRef,
  OnDestroy
} from '@angular/core';
import { Post } from '../../models/post.model';
import { PostsService } from '../../services/posts.service';
import { PageEvent } from '@angular/material/paginator';
import { ActivatedRoute } from '@angular/router';
import { DownloadService } from 'src/app/services/download.service';
import { ToastrService } from 'ngx-toastr';
import { downloadTripPdf } from 'src/app/shared/trip-pdf';
import { confirmDelete } from 'src/app/shared/confirm-dialog';
import { formatDateRange } from 'src/app/shared/date-range';
import { PLACE_VALUES, PlaceValue, placeValueMeta } from 'src/app/shared/place-values';
import { DAY_MS, TripTiming, dayStart, statusLabel, tripTiming } from 'src/app/shared/trip-timing';

interface TimelineDay {
  key: string;
  count: number;
  /** "Day 2" when the visit falls within the trip */
  dayLabel: string;
  dateLabel: string;
  posts: Post[];
}

const VIEW_KEY = 'journhive.placesView';

@Component({
  selector: 'app-post-list',
  templateUrl: './post-list.component.html',
  styleUrls: ['./post-list.component.scss']
})
export class PostListComponent implements OnInit, OnDestroy {

  @Input() postListArray: Post[] = [];
  @ViewChild('postListSection') postListSection!: ElementRef;

  totalPosts = 0;
  pageSize = 10;
  pageSizeOptions = [10, 20, 30, 50];
  filteredPageSizeOptions: number[] = [];
  currentPage = 0;
  paginatedPosts: Post[] = [];
  tripId: string | null = null;
  tripName: string | null = null;
  tripTitle: string = '';
  tripDates: string = '';
  tripCover: string | null = null;
  tripStart: Date | null = null;
  tripEnd: Date | null = null;
  timing: TripTiming | null = null;
  isLoading: boolean = true;
  pdfBusy = false;

  // Itinerary view: grouped by day, or the card grid
  viewMode: 'timeline' | 'grid' = 'timeline';
  timelineDays: TimelineDay[] = [];

  // Sidebar insights, derived from the places
  ratingStats: (PlaceValue & { count: number, pct: number })[] = [];
  ratedCount = 0;
  photoCount = 0;
  readonly statusLabel = statusLabel;
  readonly captionPreviewLength = 160;
  private expandedPosts = new Set<string>();

  private downloadSubscription: any;

  constructor(
    private postsService: PostsService,
    private route: ActivatedRoute,
    private downloadService: DownloadService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'grid' || saved === 'timeline') {
        this.viewMode = saved;
      }
    } catch { /* storage unavailable — default view */ }

    this.route.queryParamMap.subscribe((params) => {
      const name = params.get('tripName');
      if (name) {
        this.setTripName(name);
      } else {
        this.tripName = 'unknown-trip';
      }
    });

    this.route.paramMap.subscribe((paramMap) => {
      this.tripId = paramMap.get('tripId');
      this.fetchTrip();
      this.fetchPosts();
    });

    this.downloadSubscription = this.downloadService.download$.subscribe(() => {
      this.downloadPosts();
    });

  }

  ngOnDestroy(): void {
    if (this.downloadSubscription) {
      this.downloadSubscription.unsubscribe();
    }
  }

  // The trip name and dates for the page heading (the query param may be missing,
  // e.g. when arriving here after saving a place)
  fetchTrip() {
    if (!this.tripId) {
      return;
    }
    this.postsService.getTripById(this.tripId).subscribe((trip) => {
      if (trip?.destination) {
        this.setTripName(trip.destination);
      }
      this.tripDates = formatDateRange(trip?.startDate, trip?.endDate);
      this.tripStart = trip?.startDate ? new Date(trip.startDate) : null;
      this.tripEnd = trip?.endDate ? new Date(trip.endDate) : null;
      this.timing = trip?.startDate ? tripTiming(trip.startDate, trip.endDate) : null;
      this.tripCover = typeof trip?.coverPhoto === 'string' && trip.coverPhoto ? trip.coverPhoto : null;
      this.buildTimeline();
    }, () => { /* heading falls back to the query param */ });
  }

  private setTripName(name: string) {
    this.tripTitle = name;
    this.tripName = name.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  fetchPosts() {
    this.isLoading = true;
    if (!this.tripId) {
      this.postListArray = [];
      this.paginatedPosts = [];
      this.totalPosts = 0;
      this.isLoading = false;
      return;
    }

    this.postsService.getPostsByTripId(this.tripId).subscribe((data) => {
      this.postListArray = data.posts || [];
      this.totalPosts = this.postListArray.length;
      this.updatePaginatedPosts();
      this.disablePageSizeOptions();
      this.isLoading = false;
    }, () => {
      this.isLoading = false;
      this.toastr.error('We couldn\'t load the places for this trip. Please refresh to try again.', 'Something went wrong');
    });
  }

  async deletePost(postId: string) {
    const confirmed = await confirmDelete('Delete this place?', 'This place and its notes will be permanently removed. This can\'t be undone.');
    if (!confirmed) {
      return;
    }
    this.postsService.deletePost(postId).subscribe(() => {
      this.postListArray = this.postListArray.filter(
        (post) => post.id !== postId
      );
      this.totalPosts = this.postListArray.length;

      this.updatePaginatedPosts();
      this.disablePageSizeOptions();

      this.toastr.success('The place has been deleted.', 'Deleted');
    }, () => this.toastr.error('The place couldn\'t be deleted. Please try again.', 'Delete failed'));
  }

  readonly valueMeta = placeValueMeta;

  setView(mode: 'timeline' | 'grid') {
    this.viewMode = mode;
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch { /* storage unavailable */ }
  }

  maxDayCount = 1;

  // Groups all places by visit date, in date order; undated places go last.
  // (The timeline shows the whole trip; only the grid view is paginated.)
  private buildTimeline() {
    const start = dayStart(this.tripStart);
    const end = dayStart(this.tripEnd) || start;
    const groups = new Map<string, { time: number, posts: Post[] }>();
    for (const post of this.postListArray) {
      const time = dayStart(post.date);
      const key = time ? String(time) : 'undated';
      if (!groups.has(key)) {
        groups.set(key, { time, posts: [] });
      }
      groups.get(key)!.posts.push(post);
    }
    this.timelineDays = [...groups.entries()]
      .sort(([, a], [, b]) => (a.time || Infinity) - (b.time || Infinity))
      .map(([key, { time, posts }]) => {
        const inTrip = !!time && !!start && time >= start && time <= end;
        return {
          key,
          count: posts.length,
          dayLabel: !time ? 'No date' : inTrip ? `Day ${Math.round((time - start) / DAY_MS) + 1}` : '',
          dateLabel: time
            ? new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(inTrip ? {} : { year: 'numeric' }) })
            : 'Date of visit not set',
          posts,
        };
      });
    this.maxDayCount = Math.max(1, ...this.timelineDays.map(d => d.count));
  }

  // Jumps the timeline to a day (switching to the timeline view if needed)
  scrollToDay(key: string) {
    if (this.viewMode !== 'timeline') {
      this.setView('timeline');
    }
    setTimeout(() => document.getElementById('day-' + key)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // Rating breakdown and photo count for the sidebar
  private updateInsights() {
    const counts = new Map<string, number>();
    this.postListArray.forEach(post => post.value && counts.set(post.value, (counts.get(post.value) || 0) + 1));
    this.ratedCount = [...counts.values()].reduce((a, b) => a + b, 0);
    this.ratingStats = PLACE_VALUES.map(v => {
      const count = counts.get(v.name) || 0;
      return { ...v, count, pct: this.ratedCount ? Math.round((count / this.ratedCount) * 100) : 0 };
    });
    this.photoCount = this.postListArray.filter(post => !!post.image).length;
  }

  formatDate(date: Date | string | null): string {
    const parsed = date ? new Date(date) : null;
    return parsed && !isNaN(parsed.getTime())
      ? parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
  }

  isExpanded(postId: string): boolean {
    return this.expandedPosts.has(postId);
  }

  toggleExpanded(postId: string) {
    if (this.expandedPosts.has(postId)) {
      this.expandedPosts.delete(postId);
    } else {
      this.expandedPosts.add(postId);
    }
  }

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
    const lastPage = Math.max(0, Math.ceil(this.postListArray.length / (this.pageSize || 1)) - 1);
    this.currentPage = Math.min(this.currentPage, lastPage);
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedPosts = this.postListArray.slice(startIndex, endIndex);
    this.buildTimeline();
    this.updateInsights();
  }

  disablePageSizeOptions() {
    const idealMaxOption = this.pageSizeOptions.find(
      (option) => option >= this.totalPosts
    );

    if (this.totalPosts < 5) {
      this.filteredPageSizeOptions = [this.totalPosts];
    } else if (idealMaxOption) {
      this.filteredPageSizeOptions = this.pageSizeOptions.filter(
        (option) => option <= idealMaxOption
      );
    } else {
      this.filteredPageSizeOptions = [...this.pageSizeOptions];
    }

    if (
      this.pageSize > this.totalPosts ||
      !this.filteredPageSizeOptions.includes(this.pageSize)
    ) {
      this.pageSize = this.filteredPageSizeOptions[0] || this.totalPosts;
    }
  }

  // Builds and downloads the styled trip journal PDF
  async downloadPosts() {
    if (this.pdfBusy || !this.postListArray.length) {
      return;
    }
    this.pdfBusy = true;
    try {
      await downloadTripPdf({
        title: this.tripTitle || 'My trip',
        dates: this.tripDates,
        timing: this.timing?.when || '',
        status: this.timing ? statusLabel(this.timing.status) : '',
        days: this.timing?.days || 0,
        cover: this.tripCover,
        posts: this.postListArray,
        timeline: this.timelineDays,
        fileName: `${this.tripName && this.tripName !== 'unknown-trip' ? this.tripName : 'trip'}-journal.pdf`,
      });
    } catch {
      this.toastr.error('The PDF couldn\'t be created. Please try again.', 'Download failed');
    } finally {
      this.pdfBusy = false;
    }
  }
}
