/**
 * Conversas de mentira pra montar a tela do WhatsApp enquanto não há endpoint
 * que liste as conversas reais do tenant. O conteúdo é DADO (o que o cliente
 * e o atendente escreveram), não texto de interface — por isso não passa pelo
 * i18n, igual às respostas do simulador.
 */

export type WhatsAppDirection = 'in' | 'out';
export type WhatsAppStatus = 'sent' | 'delivered' | 'read';

export interface WhatsAppMessage {
  id: string;
  direction: WhatsAppDirection;
  text: string;
  /** HH:mm já formatado — mock, sem fuso. */
  time: string;
  /** Só para mensagens enviadas (`out`). */
  status?: WhatsAppStatus;
}

export interface WhatsAppConversation {
  id: string;
  name: string;
  phone: string;
  unread: number;
  messages: WhatsAppMessage[];
}

export const MOCK_CONVERSATIONS: WhatsAppConversation[] = [
  {
    id: 'c1',
    name: 'Mariana Souza',
    phone: '+55 11 98765-4321',
    unread: 2,
    messages: [
      { id: 'c1m1', direction: 'in', text: 'Oi, boa noite!', time: '19:02' },
      {
        id: 'c1m2',
        direction: 'out',
        text: 'Oi, Mariana! Aqui é a Nina, da Pizzaria Demo 🍕 O que vai ser hoje?',
        time: '19:02',
        status: 'read',
      },
      {
        id: 'c1m3',
        direction: 'in',
        text: 'Quero uma pizza grande meio calabresa meio marguerita',
        time: '19:04',
      },
      {
        id: 'c1m4',
        direction: 'out',
        text: 'Anotado: 1 pizza grande meio calabresa / meio marguerita — R$ 62,00. Vai querer alguma bebida?',
        time: '19:04',
        status: 'read',
      },
      { id: 'c1m5', direction: 'in', text: 'Uma coca 2L', time: '19:05' },
      { id: 'c1m6', direction: 'in', text: 'Entrega no Centro', time: '19:05' },
    ],
  },
  {
    id: 'c2',
    name: 'João Pereira',
    phone: '+55 11 91234-5678',
    unread: 0,
    messages: [
      {
        id: 'c2m1',
        direction: 'in',
        text: 'Vocês abrem que horas?',
        time: '17:40',
      },
      {
        id: 'c2m2',
        direction: 'out',
        text: 'Abrimos às 18h, de terça a domingo. Posso já deixar seu pedido anotado?',
        time: '17:40',
        status: 'read',
      },
      {
        id: 'c2m3',
        direction: 'in',
        text: 'Blz, depois eu chamo',
        time: '17:42',
      },
    ],
  },
  {
    id: 'c3',
    name: 'Ana Lima',
    phone: '+55 21 99876-1122',
    unread: 0,
    messages: [
      { id: 'c3m1', direction: 'in', text: 'Aceita pix?', time: '12:15' },
      {
        id: 'c3m2',
        direction: 'out',
        text: 'Aceitamos sim! Pix, cartão na entrega e dinheiro.',
        time: '12:15',
        status: 'delivered',
      },
    ],
  },
  {
    id: 'c4',
    name: 'Carlos Mendes',
    phone: '+55 31 98888-7766',
    unread: 1,
    messages: [
      {
        id: 'c4m1',
        direction: 'out',
        text: 'Seu pedido saiu para entrega! Chega em uns 30 minutos 🛵',
        time: 'Ontem',
        status: 'read',
      },
      { id: 'c4m2', direction: 'in', text: 'Chegou, obrigado!', time: 'Ontem' },
    ],
  },
];
