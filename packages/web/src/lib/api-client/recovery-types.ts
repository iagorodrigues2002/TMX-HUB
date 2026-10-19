export interface RecoveryView {
  settings: {
    checkout_url: string | null;
    sender_name: string;
    quiet_start: number;
    quiet_end: number;
    enabled: boolean;
    email_automation_enabled: boolean;
    email_delay_minutes: number;
    automation_started_at: string;
  } | null;
  sources: {
    gateway: string | null;
    gateway_enabled: boolean;
    ab_test: string | null;
    ab_destinations: number;
    entry_links: number;
    entry_clicks: number;
    vendepay_webhooks: number;
    checkout_destinations: number;
    automatic: boolean;
  };
  channels: Array<{
    id: string;
    kind: 'whatsapp' | 'sms' | 'email';
    enabled: boolean;
    configured: boolean;
    config: Record<string, string>;
    from_email?: string | null;
    updated_at: string;
  }>;
  totals: {
    eligible: number;
    contacted: number;
    clicked: number;
    recovered: number;
    recovered_minor: string;
  };
  email_metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
    recovered_minor: string;
    open_rate: number;
    click_rate: number;
    conversion_rate: number;
  };
  opportunities: Array<{
    id: string;
    status: string;
    reason: string;
    buyer_name: string | null;
    email: string | null;
    phone: string | null;
    has_email: boolean;
    has_phone: boolean;
    created_at: string;
    last_contact_at: string | null;
    clicked_at: string | null;
    recovered_at: string | null;
    external_id: string;
    amount_minor: number | null;
    amount_brl_minor: number | null;
    currency: string | null;
    product: { name?: string } | null;
    messages: number;
    last_message_state: string | null;
    email_delivered_at: string | null;
    email_opened_at: string | null;
    email_clicked_at: string | null;
    email_already_sent: boolean;
  }>;
  activity: Array<{
    id: string;
    event_type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed' | 'converted';
    event_at: string;
    url: string | null;
    channel: 'whatsapp' | 'sms' | 'email';
    opportunity_id: string;
    buyer_name: string | null;
    email: string | null;
    phone: string | null;
    external_id: string;
    product: { name?: string } | null;
    message_state: string;
  }>;
  conversions: Array<{
    opportunity_id: string;
    recovered_at: string;
    recovered_channel: 'whatsapp' | 'sms' | 'email' | null;
    original_external_id: string;
    recovered_external_id: string;
    recovered_minor: number;
    currency: string | null;
    product: { name?: string } | null;
    buyer_name: string | null;
    email: string | null;
    phone: string | null;
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
  }>;
  test_runs: Array<{
    id: string;
    recipient: string;
    state: 'pending' | 'sent' | 'failed';
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    checkout_at: string | null;
    open_count: number;
    click_count: number;
    checkout_count: number;
    created_at: string;
  }>;
}
