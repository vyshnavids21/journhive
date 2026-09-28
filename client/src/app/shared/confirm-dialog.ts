import Swal from 'sweetalert2';

// Consistent destructive-action confirmation, styled by the .swal2-* rules in styles.scss.
export function confirmDelete(title: string, text: string): Promise<boolean> {
  return Swal.fire({
    title,
    text,
    icon: 'warning',
    iconColor: '#DC2626',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    cancelButtonText: 'Cancel',
    reverseButtons: true,
    focusCancel: true,
    customClass: { confirmButton: 'swal-danger' }
  }).then(result => result.isConfirmed);
}
