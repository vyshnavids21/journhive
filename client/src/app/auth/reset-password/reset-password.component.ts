import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PostsService } from '../../services/posts.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  token: string = '';
  password: string = '';
  confirmPassword: string = '';
  showPassword: boolean = false;
  loading: boolean = false;
  invalidLink: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private postsService: PostsService,
    private toastrService: ToastrService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.invalidLink = true;
    }
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  get passwordsMismatch(): boolean {
    return !!this.confirmPassword && this.password !== this.confirmPassword;
  }

  onSubmit() {
    if (this.loading || this.invalidLink || this.passwordsMismatch || !this.password) {
      return;
    }

    this.loading = true;
    this.postsService.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.toastrService.success('Password reset successful. Please log in.', 'Success');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 400) {
          this.invalidLink = true;
        } else {
          this.toastrService.error('Something went wrong. Please try again later.', 'Error');
        }
      }
    });
  }

  navigateToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }
}
