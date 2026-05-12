import ChatView from '@/components/chat/ChatView';

export const dynamic = 'force-dynamic';

export default async function ChatPage(props) {
  const params = await props.params;
  return <ChatView chatId={params.id} />;
}
