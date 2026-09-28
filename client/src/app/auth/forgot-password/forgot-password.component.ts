import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PostsService } from '../../services/posts.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
  email: string = '';
  validEmail: boolean | null = null;
  emailNotFound: boolean = false;
  loading: boolean = false;

  constructor(private router: Router, private postsService: PostsService, private toastrService: ToastrService) {}

  validateEmail() {
    const regex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    this.validEmail = regex.test(this.email);
  }

  resetEmail() {
    this.validEmail = null;
    this.emailNotFound = false;
  }

  onSubmit() {
    this.validateEmail();
    if (!this.validEmail || this.loading) {
      return;
    }

    this.loading = true;
    this.emailNotFound = false;

    this.postsService.forgotPassword(this.email).subscribe({
      next: (res) => {
        this.loading = false;
        // In local dev (no real SMTP configured) the server returns an Ethereal
        // preview URL — log it so the reset link can be opened without a real inbox.
        if (res?.previewUrl) {
          console.log('Password reset email preview:', res.previewUrl);
        }
        this.toastrService.success(`We've sent a reset link to ${this.email}.`, 'Check your inbox');
        this.navigateToLogin();
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 404) {
          this.emailNotFound = true;
        } else {
          this.toastrService.error('Something went wrong. Please try again later.', 'Error');
        }
      }
    });
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }
}
