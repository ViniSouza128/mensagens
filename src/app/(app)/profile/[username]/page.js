'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { ShieldIcon, UserIcon, ChatsIcon, EditIcon, FlagIcon } from '@/components/icons/Icons';
import styles from './profile.module.css';

export default function ProfilePage(props) {
  const params = use(props.params);
  const username = params?.username;
  const router = useRouter();
  const { user: me, refreshMe } = useApp();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', username: '' });
  const [busy, setBusy] = useState(false);
  const [pickFile, setPickFile] = useState(null);

  const isMe = user && me && user.id === me.id;

  async function load() {
    try {
      const u = await api.get(`/api/users/${encodeURIComponent(username)}`);
      setUser(u);
      setForm({ name: u.name || '', bio: u.bio || '', username: u.username || '' });
    } catch {
      toast('Usuário não encontrado.', { tone: 'warning' });
      router.replace('/chats');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [username]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch('/api/users/me', {
        name: form.name,
        bio: form.bio,
      });
      await load();
      setEditing(false);
      refreshMe();
      toast('Perfil atualizado.', { tone: 'success' });
    } catch (err) {
      toast(err.code === 'username_taken' ? 'Nome de usuário já em uso.' : 'Não foi possível salvar.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kindHint', 'image');
      const arr = await api.upload('/api/uploads', fd);
      const meta = Array.isArray(arr) ? arr[0] : arr;
      await api.patch('/api/users/me', { avatar_path: meta.storage_path });
      await refreshMe();
      await load();
      toast('Foto atualizada.', { tone: 'success' });
    } catch {
      toast('Falha ao enviar foto.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function startChat() {
    try {
      const c = await api.post('/api/chats/direct', { user_id: user.id });
      router.push(`/chats/${c.id}`);
    } catch (err) {
      toast(err.code === 'requires_contact_request' ? 'Solicitação enviada.' : 'Não foi possível iniciar conversa.', { tone: 'warning' });
    }
  }

  async function sendRequest() {
    try {
      await api.post('/api/contacts/requests', { user_id: user.id });
      toast('Solicitação enviada.', { tone: 'success' });
    } catch (err) {
      if (err.code === 'already_contact') toast('Já é seu contato.', { tone: 'success' });
      else toast('Não foi possível enviar solicitação.', { tone: 'danger' });
    }
  }

  async function toggleContact() {
    try {
      if (user.contact) await api.delete('/api/contacts', { user_id: user.id });
      else await api.post('/api/contacts', { user_id: user.id });
      load();
    } catch { toast('Falha.', { tone: 'danger' }); }
  }

  async function toggleBlock() {
    try {
      if (user.blocked_by_me) await api.delete('/api/contacts/block', { user_id: user.id });
      else await api.post('/api/contacts/block', { user_id: user.id });
      load();
    } catch { toast('Falha.', { tone: 'danger' }); }
  }

  async function report() {
    const reason = prompt('Motivo da denúncia:');
    if (!reason) return;
    try {
      await api.post('/api/reports', { target_type: 'user', target_id: user.id, reason });
      toast('Denúncia enviada.', { tone: 'success' });
    } catch { toast('Falha ao denunciar.', { tone: 'danger' }); }
  }

  if (!user) return <div className={styles.empty}>Carregando…</div>;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.avatarWrap}>
          <Avatar name={user.name} src={user.avatar_path} size={140} />
          {isMe ? (
            <label className={styles.changeAvatar}>
              <EditIcon size={16} /> Trocar foto
              <input type="file" accept="image/*" hidden onChange={(e) => uploadAvatar(e.target.files?.[0])} />
            </label>
          ) : null}
        </div>
        {!editing ? (
          <>
            <h1 className={styles.name}>{user.name || user.username}</h1>
            <p className={styles.username}>@{user.username}</p>
            {user.bio ? <p className={styles.bio}>{user.bio}</p> : null}
            <div className={styles.actions}>
              {isMe ? (
                <Button onClick={() => setEditing(true)}><EditIcon size={16} /> Editar perfil</Button>
              ) : (
                <>
                  {user.blocks_me ? null : user.blocks_unknown && !user.contact ? (
                    <Button onClick={sendRequest}><UserIcon size={16} /> Enviar solicitação</Button>
                  ) : (
                    <Button onClick={startChat}><ChatsIcon size={16} /> Conversar</Button>
                  )}
                  {!user.blocks_me ? (
                    <Button variant="ghost" onClick={toggleContact}>
                      <UserIcon size={16} /> {user.contact ? 'Remover dos contatos' : 'Adicionar aos contatos'}
                    </Button>
                  ) : null}
                  <Button variant="ghost" danger onClick={toggleBlock}>
                    <ShieldIcon size={16} /> {user.blocked_by_me ? 'Desbloquear' : 'Bloquear'}
                  </Button>
                  <Button variant="ghost" danger onClick={report}><FlagIcon size={16} /> Denunciar</Button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className={styles.editForm}>
            <Field label="Nome">
              {(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />}
            </Field>
            <Field label="Bio">
              {(id) => (
                <textarea
                  id={id}
                  className={styles.textarea}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  maxLength={300}
                  rows={3}
                />
              )}
            </Field>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button>
              <Button onClick={save} loading={busy}>Salvar</Button>
            </div>
          </div>
        )}
      </header>

      <section className={styles.section}>
        <h2 className={styles.h2}>Sobre</h2>
        <dl className={styles.list}>
          <Item label="Membro desde" value={user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : ''} />
          {!isMe && user.mutual ? <Item label="Status" value="Contato mútuo" /> : null}
          {!isMe && user.blocks_me ? <Item label="Aviso" value="Você não pode contatar este usuário." /> : null}
          {!isMe && !user.blocks_me && user.blocks_unknown && !user.contact && !user.mutual
            ? <Item label="Privacidade" value="Este usuário só aceita mensagens de contatos." />
            : null}
        </dl>
      </section>
    </div>
  );
}

function Item({ label, value }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt><dd>{value}</dd>
    </>
  );
}
