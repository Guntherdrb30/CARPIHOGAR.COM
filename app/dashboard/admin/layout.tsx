import AdminShell from '@/components/admin/admin-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-6 print:px-0 print:py-0">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
