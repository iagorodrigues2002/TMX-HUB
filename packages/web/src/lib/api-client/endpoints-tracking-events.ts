import { request } from './request.js';
import type { TrackingPeriod } from './response-types.js';
import { trackingPeriodParams } from './response-types.js';
export const endpoints = {
  async listTrackingEvents(
    id: string,
    page = 1,
    perPage = 25,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    items: Array<{
      id: string;
      visitor_id: string;
      session_id?: string;
      event_name: string;
      event_url: string;
      page_title?: string;
      referrer?: string;
      source: Record<string, string>;
      client_at?: string;
      received_at: string;
    }>;
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const params = trackingPeriodParams(period);
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    return request(`/v1/offers/${id}/tracking/events?${params.toString()}`);
  },

  async getTrackingPageFunnel(
    id: string,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    pages: Array<{
      page_url: string;
      page_title: string;
      views: number;
      visitors: number;
      exits: number;
    }>;
  }> {
    const params = trackingPeriodParams(period);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/v1/offers/${id}/tracking/page-funnel${query}`);
  },

  async listTrackingJourneys(
    id: string,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    journeys: Array<{
      visitor_id: string;
      journey_id: string;
      last_seen_at: string;
      pages: Array<{
        id: string;
        title: string;
        url: string;
        referrer?: string;
        visited_at: string;
      }>;
      events: string[];
      order_id?: string;
      order_status?: string;
      buyer?: Record<string, unknown>;
    }>;
  }> {
    const params = trackingPeriodParams(period);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/v1/offers/${id}/tracking/journeys${query}`);
  },

  async listTrackingOrders(
    id: string,
    page = 1,
    perPage = 25,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    items: Array<{
      id: string;
      provider: string;
      external_id: string;
      status: string;
      amount_minor?: string;
      currency?: string;
      visitor_id?: string;
      buyer: Record<string, unknown>;
      raw_status?: string;
      occurred_at: string;
      updated_at: string;
    }>;
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const params = trackingPeriodParams(period);
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    return request(`/v1/offers/${id}/tracking/orders?${params.toString()}`);
  },

  async getTrackingAttribution(
    id: string,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    rows: Array<{
      source: string;
      campaign_name: string;
      campaign_id?: string;
      page_name?: string | null;
      page_id?: string | null;
      adset_name: string;
      adset_id?: string;
      ad_name: string;
      ad_id?: string;
      placement: string;
      ad_clicks: number;
      unique_ad_clicks: number;
      page_views: number;
      visitors: number;
      checkouts: number;
      unique_checkouts: number;
      orders: number;
      paid_orders: number;
      refused_orders: number;
      paid_revenue_minor: string;
    }>;
  }> {
    const params = trackingPeriodParams(period);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/v1/offers/${id}/tracking/attribution${query}`);
  },

  async getTrackingCountries(
    id: string,
    period?: string | TrackingPeriod,
  ): Promise<{
    date: string;
    time_zone: string;
    rows: Array<{
      country: string;
      page_views: number;
      checkouts: number;
      orders: number;
      paid_orders: number;
      front_buyers: number;
      paid_revenue_minor: string;
      paid_revenue_brl_minor: string;
      aov_brl_minor: string;
    }>;
  }> {
    const params = trackingPeriodParams(period);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/v1/offers/${id}/tracking/countries${query}`);
  },
};
