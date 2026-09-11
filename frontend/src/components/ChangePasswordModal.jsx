import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Button, ErrorBox, Field, Modal } from './ui.jsx';

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) { setError(new Error('New passwords do not match')); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', form);
      toast.success('Password updated');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const bind = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }), type: 'password', className: 'input', autoComplete: 'new-password' });
  return (
    <Modal open={open} onClose={onClose} title="Change password" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Update password</Button></>}>
      <form onSubmit={submit} className="stack">
        <ErrorBox error={error} />
        <Field label="Current password" required><input {...bind('currentPassword')} autoComplete="current-password" /></Field>
        <Field label="New password" required hint="Minimum 8 characters with upper-case, lower-case and a number"><input {...bind('newPassword')} /></Field>
        <Field label="Confirm new password" required><input {...bind('confirm')} /></Field>
      </form>
    </Modal>
  );
}
