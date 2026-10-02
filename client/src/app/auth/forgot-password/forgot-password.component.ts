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
  loading: boolean = false;

  constructor(private router: Router, private postsService: PostsService, private toastrService: ToastrService) {}

  validateEmail() {
    const regex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    this.validEmail = regex.test(this.email);
  }

  resetEmail() {
    this.validEmail = null;
  }

  onSubmit() {
    this.validateEmail();
    if (!this.validEmail || this.loading) {
      return;
    }

    this.loading = true;

    this.postsService.forgotPassword(this.email).subscribe({
      next: (res) => {
        this.loading = false;
        // In local dev (no real SMTP configured) the server returns an Ethereal
        // preview URL — log it so the reset link can be opened without a real inbox.
        if (res?.previewUrl) {
          console.log('Password reset email preview:', res.previewUrl);
        }
        // Same message whether or not the account exists, so the page never reveals registered emails
        this.toastrService.success('If an account exists for this email, we\'ve sent a password reset link.', 'Check your inbox');
        this.navigateToLogin();
      },
      error: () => {
        this.loading = false;
        this.toastrService.error('Something went wrong. Please try again later.', 'Error');
      }
    });
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }
}
