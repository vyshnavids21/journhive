import { Component } from '@angular/core';
import { Router } from '@angular/router';

const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  constructor(private router: Router) { }

  showHeader(): boolean {
    const path = this.router.url.split(/[?#]/)[0];
    return path !== '/' && !AUTH_ROUTES.includes(path);
  }

}
