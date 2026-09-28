import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PostsService } from 'src/app/services/posts.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  
  email = "";
  password = "";
  showPassword: boolean = false;
  validEmail: boolean = true;
  incorrectPassword: boolean = false;
  userNotFound: boolean = false;
  loading: boolean = false;

  constructor(private router: Router, private postsService: PostsService, private toastrService: ToastrService) { }

  ngOnInit(): void {
   
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onLogin() {
    if (this.loading) {
      return;
    }
    this.loading = true;
    const loginData = new FormData();
    loginData.append('email', this.email);
    loginData.append('password', this.password);
    this.postsService.saveLoginData(loginData).subscribe((res) => {
      this.loading = false;
      const token = (res as any)?.token;
      if (token) {
        this.postsService.setToken(token);
      }
      const loggedInUserId = (res.user as any)?._id;
      if (loggedInUserId) {
        this.postsService.setUserId(loggedInUserId);
      }
      const loggedInUserEmail = res.user?.email;
      if(loggedInUserEmail) {
        this.postsService.setUserEmail(loggedInUserEmail);
      }
      this.toastrService.success('Good to see you again.', 'Logged in');
      this.router.navigate(['/trips']);
    }, (err) => {
      this.loading = false;
      if (err.status === 401) {
        this.incorrectPassword = true;
      } else if (err.status === 400) {
        this.userNotFound = true;
      } else {
        this.toastrService.error('Something went wrong. Please try again.', 'Login failed');
      }
    });
  }

  validateEmail() {
    const email = this.email.trim();
    const endsWithGmail = email.toLowerCase().endsWith('@gmail.com');
    const firstPart = email.split('@')[0].toLowerCase();
    const hasValidChars = /^[a-z0-9.-_]+$/.test(firstPart);
    const startAndEndValidation = !firstPart.startsWith('-') && !firstPart.endsWith('-') && !firstPart.startsWith('_')
      && !firstPart.endsWith('_') && !firstPart.startsWith('.') && !firstPart.endsWith('.') && !firstPart.includes('..');
    const hasCharacters = firstPart.length >= 2;
    this.validEmail = endsWithGmail && hasValidChars && startAndEndValidation && hasCharacters;
  }

  resetEmail() {
    this.validEmail = true;
  }

  resetPassword() {
    this.incorrectPassword = false;
    this.userNotFound = false;
  }

  disableCopyPaste(event: ClipboardEvent) {
    event.preventDefault();
  }

}
