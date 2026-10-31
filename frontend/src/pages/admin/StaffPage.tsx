import { KeyRound, Pencil, Plus, Power, Save } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ActionButton, Button, Card, Loaded, Modal, PageHeader, StatusBadge, Tabs } from '../../components/common/ui';
import { FormGrid, PasswordField, rules, SelectField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { useList } from '../../hooks/useList';
import { get, patch, post, put } from '../../services/api';
import type { Row } from '../../types';
import { date, titleCase } from '../../utils/format';

const PROFILES: [string, string][] = [['sales', 'Sales Staff'], ['operations', 'Operations Staff'], ['finance', 'Finance Staff']];
const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const base = { fullName: rules.required, email: rules.email, phone: rules.phone, profile: rules.required, status: rules.required };

function StaffForm({ staff, onClose, onSaved }: { staff: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(staff ? z.object(base) : z.object({ ...base, password: rules.password }), staff ? { fullName: staff.fullName, email: staff.email, phone: staff.phone ?? '', profile: staff.profile, status: staff.status } : { fullName: '', email: '', phone: '', password: '', profile: 'sales', status: 'active' });
  const submit = useSubmit(form);
  return (
    <Modal
      title={staff ? 'Edit staff member' : 'Add staff member'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="staff-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="staff-form"
        noValidate
        onSubmit={submit(async (values) => {
          if (staff) await put(`/staff/${staff.id}`, values);
          else await post('/staff', values);
          feedback.success(staff ? 'Staff member updated' : 'Staff member added');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="fullName" label="Full name" required />
          <TextField form={form} name="email" label="Email" type="email" required />
          <TextField form={form} name="phone" label="Phone number" type="tel" required />
          {!staff && <PasswordField form={form} name="password" label="Password" autoComplete="new-password" hint="More than eight characters, with uppercase, lowercase and a special character." required />}
          <SelectField form={form} name="profile" label="Permission profile" options={PROFILES} required />
          <SelectField form={form} name="status" label="Account status" options={STATUSES} required />
        </FormGrid>
      </form>
    </Modal>
  );
}

function StaffList() {
  const list = useList('/staff');
  const feedback = useFeedback();
  const act = useAction();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button icon={Plus} onClick={() => setEditing('new')}>Add staff</Button>
      </div>
      <ListCard
        list={list}
        placeholder="Search name, email or phone"
        filters={
          <>
            <FilterSelect label="Profile" value={list.param('profile')} onChange={(v) => list.setParam('profile', v)} options={PROFILES} />
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
          </>
        }
        columns={[
          { key: 'fullName', header: 'Name', sort: 'fullName', render: (r) => <span className="font-semibold">{r.fullName}</span> },
          { key: 'email', header: 'Email', sort: 'email' },
          { key: 'phone', header: 'Phone', optional: true },
          { key: 'profileName', header: 'Profile' },
          { key: 'lastLoginAt', header: 'Last login', optional: true, render: (r) => date(r.lastLoginAt) },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <span className="inline-flex gap-1">
                <Button variant="ghost" small icon={Pencil} aria-label={`Edit ${r.fullName}`} onClick={() => setEditing(r)} />
                <Button
                  variant="ghost"
                  small
                  icon={KeyRound}
                  aria-label={`Send password reset to ${r.fullName}`}
                  title="Send password reset link"
                  onClick={async () => {
                    if (await feedback.confirm({ title: 'Send password reset', message: `Email a one-hour reset link to ${r.email}?`, confirmLabel: 'Send link' })) {
                      await act(() => post(`/staff/${r.id}/reset-password`), 'Reset link sent');
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  small
                  icon={Power}
                  aria-label={`${r.status === 'active' ? 'Deactivate' : 'Activate'} ${r.fullName}`}
                  title={r.status === 'active' ? 'Deactivate' : 'Activate'}
                  onClick={async () => {
                    const next = r.status === 'active' ? 'inactive' : 'active';
                    const ok = await feedback.confirm({ title: next === 'active' ? 'Activate account' : 'Deactivate account', message: next === 'active' ? `${r.fullName} will be able to log in again.` : `${r.fullName} will be signed out immediately and unable to log in.`, danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                    if (ok && (await act(() => patch(`/staff/${r.id}/status`, { status: next }), 'Account updated'))) void list.reload();
                  }}
                />
              </span>
            ),
          },
        ]}
      />
      {editing && (
        <StaffForm
          staff={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
    </>
  );
}

function ProfileCard({ profile, available, onSaved }: { profile: Row; available: string[]; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>(profile.permissions);
  const act = useAction();
  const dirty = [...selected].sort().join() !== [...profile.permissions].sort().join();
  return (
    <Card
      title={`${profile.name} (${profile.staffCount})`}
      action={
        <ActionButton small icon={Save} disabled={!dirty} onAction={async () => {
          if (await act(() => put(`/staff-profiles/${profile.code}`, { permissions: selected }), 'Permissions saved')) onSaved();
        }}>
          Save
        </ActionButton>
      }
    >
      <p className="mb-3 text-xs text-ink-2">{profile.description}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((permission) => (
          <label key={permission} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={selected.includes(permission)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, permission] : selected.filter((p) => p !== permission))}
            />
            {titleCase(permission)}
          </label>
        ))}
      </div>
    </Card>
  );
}

function Permissions() {
  const state = useFetch<{ profiles: Row[]; available: string[] }>(() => get('/staff-profiles'), []);
  return (
    <Loaded state={state}>
      {({ profiles, available }) => (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Changes apply to everyone on that profile right away. Staff, tax, discount, catalogue and settings management always stay with Admin.</p>
          {profiles.map((profile) => (
            <ProfileCard key={`${profile.code}-${profile.permissions.join()}`} profile={profile} available={available} onSaved={() => void state.reload()} />
          ))}
        </div>
      )}
    </Loaded>
  );
}

export default function StaffPage() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'staff';
  return (
    <>
      <PageHeader title="Users and Staff" subtitle="Internal accounts and what each profile can do." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Users and Staff' }]} />
      <Tabs tabs={[{ key: 'staff', label: 'Staff' }, { key: 'permissions', label: 'Permission profiles' }]} active={tab} onChange={(key) => setSearch({ tab: key })} />
      {tab === 'staff' ? <StaffList /> : <Permissions />}
    </>
  );
}
