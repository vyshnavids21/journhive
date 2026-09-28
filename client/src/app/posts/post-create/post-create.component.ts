import { Component, OnInit } from '@angular/core';
import { Post } from '../../models/post.model';
import { PostsService } from '../../services/posts.service';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { PLACE_VALUES } from 'src/app/shared/place-values';
import { readImageSize } from 'src/app/shared/image-url';

@Component({
  selector: 'app-post-create',
  templateUrl: './post-create.component.html',
  styleUrls: ['./post-create.component.scss']
})
export class PostCreateComponent implements OnInit {
  enteredTitle = '';
  enteredContent = '';
  public mode = 'create';
  public postId: string | null = null;
  public post: Post = { id: '', title: '', caption: '', image: null, creatorId: '', skipImage: false, value: '', date: null, tripId: '' };
  public imagePreview: string | ArrayBuffer | null = null;
  selectedImage: File | null = null;
  creatorId: string = '';
  trips: any[] = [];
  selectedTripId = '';

  values = PLACE_VALUES;
  isDragging = false;
  saving = false;

  // Real pixel size of the chosen photo, shown on the preview
  imageSize: { width: number, height: number } | null = null;


  constructor(private postsService: PostsService, private route: ActivatedRoute, private toastr: ToastrService,
    private router: Router
  ) {

  }

  ngOnInit(): void {
    this.postsService.getUserId().subscribe((id) => {
      this.creatorId = id || '';
      if (this.creatorId) {
        this.postsService.getTripByCreatorId(this.creatorId).subscribe(res => {
          this.trips = res.trips;
        });
      }
    })
    this.route.paramMap.subscribe(paramMap => {
      this.postId = paramMap.get('postId');
      const routeTripId = paramMap.get('tripId');
      if (routeTripId) {
        this.selectedTripId = routeTripId;
      }
      this.mode = this.postId ? 'edit' : 'create';

      if (this.postId) {
        this.postsService.getPostById(this.postId).subscribe(postData => { //fetching post details to edit post.Only used in edit mode.
          this.post = postData;
          this.selectedTripId = postData.tripId || '';
          if (postData.date) {
            this.post.date = new Date(postData.date);
          }
          if (postData.image && typeof postData.image === 'string') {
            this.imagePreview = postData.image;
            this.measureImage(this.imagePreview);
          }
        });
      }
    });
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
    this.post.skipImage = false;
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview = reader.result;
      this.measureImage(this.imagePreview);
    };
    reader.readAsDataURL(file);
  }

  selectMood(value: string) {
    this.post.value = value;
  }

  onCheckboxChanged(event: any) {
    this.post.skipImage = event.checked;
  }

  savePost() {
    if (!this.post.title || !this.post.caption || !this.post.value || this.saving) {
      return;
    }
    this.saving = true;

    const postData = new FormData();
    postData.append('title', this.post.title);
    postData.append('caption', this.post.caption);
    if (this.selectedImage) {
      postData.append('image', this.selectedImage, this.selectedImage.name);
    }
    postData.append('creatorId', this.creatorId);
    postData.append('skipImage', this.post.skipImage.toString());
    postData.append('value', this.post.value);
    postData.append('date', this.post.date ? this.post.date.toDateString() : '');
    if (this.selectedTripId) {
      postData.append('tripId', this.selectedTripId);
    }

    if (this.mode === 'create') {
      this.postsService.addPost(postData).subscribe(
        (res) => {
          this.saving = false;
          this.toastr.success(`${this.post.title} has been added to your trip.`, 'Place added');
          this.post.title = '';
          this.post.caption = '';
          this.post.value = '';
          // this.post.date = new Date();
          this.post.skipImage = false;
          this.selectedImage = null;
          this.imagePreview = null;
          // Navigate back to trip's post list if tripId exists, otherwise to trips dashboard
          if (this.selectedTripId) {
            this.router.navigate(['/trips', this.selectedTripId]);
          } else {
            this.router.navigate(['/trips']);
          }
        },
        (err) => {
          this.saving = false;
          this.toastr.error('The place couldn\'t be added. Please try again.', 'Something went wrong');
        }
      );
    } else if (this.mode === 'edit' && this.postId) {
      this.postsService.updatePost(this.postId, postData).subscribe(
        (res) => {
          this.saving = false;
          this.toastr.success('Your changes have been saved.', 'Place updated');
          // Navigate back to trip's post list if tripId exists, otherwise to trips dashboard
          if (this.selectedTripId) {
            this.router.navigate(['/trips', this.selectedTripId]);
          } else {
            this.router.navigate(['/trips']);
          }
        },
        (err) => {
          this.saving = false;
          const msg = err?.error?.message || 'Your changes couldn\'t be saved. Please try again.';
          this.toastr.error(msg, 'Something went wrong');
        }
      );
    }
  }

  onCheckedSkipImage(event: any) {
    this.post.skipImage = event.checked;
    if (this.post.skipImage) {
      this.imagePreview = null;
      this.selectedImage = null;
      this.imageSize = null;
    }
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

  cancelClick() {
    // Navigate back to trip's post list if tripId exists, otherwise to trips dashboard
    if (this.selectedTripId) {
      this.router.navigate(['/trips', this.selectedTripId]);
    } else {
      this.router.navigate(['/trips']);
    }
  }

}


