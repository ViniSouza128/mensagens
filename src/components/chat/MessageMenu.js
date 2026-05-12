'use client';
import Menu, { MenuItem, MenuDivider, MenuList } from '@/components/ui/Menu';
import IconButton from '@/components/ui/IconButton';
import {
  MoreIcon, ReplyIcon, ForwardIcon, StarIcon, PinIcon, EditIcon, TrashIcon, FlagIcon, InfoIcon, CheckIcon, CopyIcon,
} from '@/components/icons/Icons';

export default function MessageMenu({
  msg, isMine, isPinned, canEdit, inline = false,
  onReply, onForward, onStar, onPin, onEdit, onDelete, onReport, onDetails, onCopy, onSelect,
}) {
  const items = (close = () => {}) => (
    <>
      <MenuItem icon={<ReplyIcon size={16} />} onClick={() => { close(); onReply?.(); }}>Responder</MenuItem>
      <MenuItem icon={<ForwardIcon size={16} />} onClick={() => { close(); onForward?.(); }}>Encaminhar</MenuItem>
      {msg.body ? <MenuItem icon={<CopyIcon size={16} />} onClick={() => { close(); onCopy?.(); }}>Copiar texto</MenuItem> : null}
      <MenuItem icon={<StarIcon size={16} />} onClick={() => { close(); onStar?.(); }}>{msg.starred ? 'Remover dos favoritos' : 'Favoritar'}</MenuItem>
      <MenuItem icon={<PinIcon size={16} />} onClick={() => { close(); onPin?.(); }}>{isPinned ? 'Desafixar' : 'Fixar na conversa'}</MenuItem>
      <MenuDivider />
      <MenuItem icon={<InfoIcon size={16} />} onClick={() => { close(); onDetails?.(); }}>Ver detalhes</MenuItem>
      <MenuItem icon={<CheckIcon size={16} />} onClick={() => { close(); onSelect?.(); }}>Selecionar</MenuItem>
      {isMine && canEdit ? <MenuItem icon={<EditIcon size={16} />} onClick={() => { close(); onEdit?.(); }}>Editar</MenuItem> : null}
      {isMine ? <MenuItem icon={<TrashIcon size={16} />} danger onClick={() => { close(); onDelete?.(); }}>Apagar</MenuItem> : null}
      {!isMine ? <MenuItem icon={<FlagIcon size={16} />} danger onClick={() => { close(); onReport?.(); }}>Denunciar</MenuItem> : null}
    </>
  );

  if (inline) {
    return <MenuList>{items()}</MenuList>;
  }

  return (
    <Menu trigger={<IconButton label="Opções"><MoreIcon size={16} /></IconButton>} align="end">
      {({ close }) => items(close)}
    </Menu>
  );
}
