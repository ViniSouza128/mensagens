'use client';
import Menu, { MenuItem, MenuDivider, MenuList } from '@/components/ui/Menu';
import IconButton from '@/components/ui/IconButton';
import {
  MoreIcon, ReplyIcon, ForwardIcon, StarIcon, PinIcon, EditIcon, TrashIcon, FlagIcon, InfoIcon, CheckIcon, CopyIcon,
} from '@/components/icons/Icons';

export default function MessageMenu({
  msg, isMine, isPinned, canEdit, inline = false,
  onReply, onForward, onStar, onPin, onEdit, onDelete, onDeleteForMe, onReport, onDetails, onCopy, onSelect,
}) {
  // msg.bot=true significa: mensagem produzida por um bot LLM (extra.bot
  // setado em src/server/llm/bots.js). Responder não faz sentido para bot —
  // ele não entende citação ou quote como humano.
  const isBotMsg = !!msg.bot;
  const items = (close = () => {}) => (
    <>
      {!isBotMsg ? <MenuItem icon={<ReplyIcon size={16} />} onClick={() => { close(); onReply?.(); }}>Responder</MenuItem> : null}
      <MenuItem icon={<ForwardIcon size={16} />} onClick={() => { close(); onForward?.(); }}>Encaminhar</MenuItem>
      {msg.body ? <MenuItem icon={<CopyIcon size={16} />} onClick={() => { close(); onCopy?.(); }}>Copiar texto</MenuItem> : null}
      <MenuItem icon={<StarIcon size={16} />} onClick={() => { close(); onStar?.(); }}>{msg.starred ? 'Remover dos favoritos' : 'Favoritar'}</MenuItem>
      <MenuItem icon={<PinIcon size={16} />} onClick={() => { close(); onPin?.(); }}>{isPinned ? 'Desafixar' : 'Fixar na conversa'}</MenuItem>
      <MenuDivider />
      <MenuItem icon={<InfoIcon size={16} />} onClick={() => { close(); onDetails?.(); }}>Ver detalhes</MenuItem>
      <MenuItem icon={<CheckIcon size={16} />} onClick={() => { close(); onSelect?.(); }}>Selecionar</MenuItem>
      {isMine && canEdit ? <MenuItem icon={<EditIcon size={16} />} onClick={() => { close(); onEdit?.(); }}>Editar</MenuItem> : null}
      <MenuItem icon={<TrashIcon size={16} />} onClick={() => { close(); onDeleteForMe?.(); }}>Apagar para mim</MenuItem>
      {isMine ? <MenuItem icon={<TrashIcon size={16} />} danger onClick={() => { close(); onDelete?.(); }}>Apagar para todos</MenuItem> : null}
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
