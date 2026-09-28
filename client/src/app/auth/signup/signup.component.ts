import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PostsService } from 'src/app/services/posts.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss']
})

export class SignupComponent implements OnInit {
  name = "";
  email = "";
  password = "";
  showPassword: boolean = false;
  fetchedUserEmails: any[] = [];
  emailExists: boolean = false;
  validEmail: boolean = true;
  validPassword: boolean = true;
  loading: boolean = false;

  constructor(private router: Router, private postsService: PostsService,
    private toastrService: ToastrService
  ) { }

  ngOnInit(): void {
  
  }

  onSignup() {
    if (this.loading) {
      return;
    }
    this.loading = true;
    const signupData = new FormData();
    signupData.append('name', this.name);
    signupData.append('email', this.email);
    signupData.append('password', this.password)
    this.postsService.saveSignupData(signupData).subscribe((res) => {
      this.loading = false;
      const token = (res as any)?.token;
      if (token) {
        this.postsService.setToken(token);
      }
      const signedUpUserId = (res.user as any)?._id;
      if(signedUpUserId) {
        this.postsService.setUserId(signedUpUserId);
      }
      const loggedInUserEmail = res.user?.email;
      if(loggedInUserEmail) {
        this.postsService.setUserEmail(loggedInUserEmail);
      }
      this.toastrService.success('Your account is ready. Happy travels!', 'Welcome to JournHive');
      this.router.navigate(['/trips']);
    }, (err) => {
      this.loading = false;
      const message = err?.error?.message || 'Signup failed';
      this.toastrService.error(message, 'Error');
    });
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  checkEmailExists() {
    this.postsService.getSignupData().subscribe((res) => {
      this.fetchedUserEmails = res.users.map(user => user.email);
      if (this.fetchedUserEmails.includes(this.email)) {
        this.emailExists = true;
      }
    }, (err) => {
      console.log(err)
    })
  }

  validateEmail() {
    const email = this.email.trim();
    const endsWithGmail = email.toLowerCase().endsWith('@gmail.com');
    const firstPart = email.split('@')[0].toLowerCase();
    const hasValidChars = /^[a-z0-9.-_]+$/.test(firstPart);
    const startAndEndValidation = !firstPart.startsWith('.') && !firstPart.endsWith('.') && !firstPart.startsWith('-') && !firstPart.endsWith('-')
      && !firstPart.startsWith('_') && !firstPart.endsWith('_') && !firstPart.includes('..');
    const hasCharacters = firstPart.length >= 2;
    this.validEmail = endsWithGmail && hasValidChars && startAndEndValidation && hasCharacters;
  }

  onEmailBlur() {
    this.checkEmailExists();
    this.validateEmail();
  }

  validatePassword() {
    if(this.password.length >= 8) {
      this.validPassword = true;
    }
    else {
      this.validPassword = false;
    }
  }

  resetInput() {
      this.emailExists = false;
      this.validEmail = true;
      this.validPassword = true;
  }

  disableCopyPaste(event: ClipboardEvent) {
    event.preventDefault();
  }

}
