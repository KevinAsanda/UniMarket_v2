import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { IconX, IconSend } from '@tabler/icons-react';
import '../styles/chat.css';

/**
 * ChatPanel — Realtime slide-in chat panel for a specific order.
 *
 * Props:
 *   orderId       {string}   — The order this chat belongs to
 *   orderLabel    {string}   — Display name (product name + counterpart)
 *   counterpartId {string}   — The other party's student_id
 *   onClose       {function} — Called when the panel is dismissed
 */
export const ChatPanel = ({ orderId, orderLabel, onClose }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const channelRef = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load existing messages and set up Realtime subscription
  const loadMessages = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          message_id, content, created_at, sender_id,
          students ( first_name, last_name )
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('[ChatPanel] loadMessages error:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadMessages();

    // Subscribe to new messages via Supabase Realtime
    const channel = supabase
      .channel(`chat:order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${orderId}`,
        },
        async (payload) => {
          // Fetch the full message with sender name
          const { data } = await supabase
            .from('messages')
            .select(`message_id, content, created_at, sender_id, students ( first_name, last_name )`)
            .eq('message_id', payload.new.message_id)
            .single();

          if (data) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.message_id === data.message_id)) return prev;
              return [...prev, data];
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [orderId, loadMessages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !user || sending) return;

    setSending(true);
    setInputText('');

    try {
      const { error } = await supabase.from('messages').insert({
        order_id: orderId,
        sender_id: user.student_id,
        content: text,
      });

      if (error) {
        console.error('[ChatPanel] send error:', error.message);
        setInputText(text); // Restore input on failure
      }
    } catch (err) {
      console.error('[ChatPanel] send exception:', err);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  };

  // Group messages by date
  const grouped = messages.reduce((acc, msg) => {
    const dateKey = new Date(msg.created_at).toDateString();
    if (!acc[dateKey]) acc[dateKey] = { label: formatDate(msg.created_at), msgs: [] };
    acc[dateKey].msgs.push(msg);
    return acc;
  }, {});

  return (
    <div className="chat-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="chat-panel" role="dialog" aria-label="Chat panel">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <span className="chat-header-title">💬 {orderLabel}</span>
            <span className="chat-header-sub">Order chat — secure &amp; private</span>
          </div>
          <button className="chat-close-btn" onClick={onClose} aria-label="Close chat">
            <IconX size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages" id="chatMessages">
          {loading ? (
            <div className="chat-loading">
              <div className="spinner-border spinner-border-sm text-secondary" role="status" />
              <span>Loading messages…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty-icon">💬</span>
              No messages yet.<br />
              Start the conversation below!
            </div>
          ) : (
            Object.entries(grouped).map(([dateKey, { label, msgs }]) => (
              <div key={dateKey}>
                {/* Date divider */}
                <div style={{
                  textAlign: 'center',
                  fontSize: '11px',
                  color: '#9ca3af',
                  margin: '8px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                  {label}
                  <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                </div>

                {msgs.map((msg) => {
                  const isMine = msg.sender_id === user?.student_id;
                  const senderName = msg.students
                    ? `${msg.students.first_name} ${msg.students.last_name}`
                    : 'Unknown';

                  return (
                    <div key={msg.message_id} className={`chat-bubble-wrap${isMine ? ' mine' : ''}`}>
                      <div className={`chat-bubble${isMine ? ' mine' : ' theirs'}`}>
                        {msg.content}
                      </div>
                      <div className="chat-bubble-meta">
                        {isMine ? 'You' : senderName} · {formatTime(msg.created_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-footer">
          <div className="chat-input-row">
            <textarea
              id="chatInput"
              className="chat-input"
              rows={1}
              placeholder="Type a message…"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={1000}
              disabled={sending}
            />
            <button
              id="chatSendBtn"
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              aria-label="Send message"
            >
              <IconSend size={18} strokeWidth={2} />
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', textAlign: 'right' }}>
            Press Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
};
