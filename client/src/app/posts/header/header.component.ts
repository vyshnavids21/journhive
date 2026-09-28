import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PostsService } from 'src/app/services/posts.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {

  showUserMenu: boolean = false;
  public userEmailId: string = '';

  constructor(private router: Router, private postsService: PostsService) { }

  ngOnInit(): void {
    this.postsService.getUserEmail().subscribe((email) => {
      this.userEmailId = email || '';
    })
  }

  get userInitial(): string {
    return (this.userEmailId.charAt(0) || '?').toUpperCase();
  }

  toggleUserMenu(event: MouseEvent) {
    event.stopPropagation();
    this.showUserMenu = !this.showUserMenu;
  }

  closeMenu() {
    this.showUserMenu = false;
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeMenu();
  }

  logout() {
    this.closeMenu();
    this.postsService.logout();
    this.router.navigate(['/login']);
  }
}
