import type { Metadata } from 'next';
import { AuditLogsDashboard } from './components/AuditLogsDashboard';

export const metadata: Metadata = {
  title: 'Audit Logs',
};

export default function AuditLogsPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Audit Logs</h1>
      <AuditLogsDashboard />
    </div>
  );
}
