/**
 * Driver registry — picks mock vs live per driver.
 *
 * DRIVER_MODE:
 *   "mock"  force every driver to mock (the keyless end-to-end demo)
 *   "live"  prefer live; fall back to mock when a driver's keys are missing
 *   (unset) "auto" — same as live: use a live driver whenever its keys exist
 *
 * This is what makes the system run end-to-end with zero keys and flip to real
 * one driver at a time as you add credentials.
 */
import type {
  AdDriver,
  CallDriver,
  CalendarDriver,
  CrmDriver,
  DriverSet,
  EnrichDriver,
  ScrubDriver,
} from "./types.js";
import {
  MockAdDriver,
  MockCallDriver,
  MockCalendarDriver,
  MockCrmDriver,
  MockEnrichDriver,
  MockScrubDriver,
} from "./mock.js";
import { MetaLeadAdsDriver } from "./meta.js";
import { RetellCallDriver } from "./retell.js";
import { ApolloEnrichDriver } from "./apollo.js";
import { TwilioScrubDriver } from "./twilio.js";
import { GoogleCalendarDriver } from "./google.js";
import { NotionCrmDriver } from "./notion.js";
import { hasCredentials, isAuthorized } from "../calendar/auth.js";

const MODE = process.env.DRIVER_MODE ?? "auto";

function choose<T>(liveReady: boolean, makeLive: () => T, makeMock: () => T): T {
  if (MODE === "mock") return makeMock();
  return liveReady ? makeLive() : makeMock();
}

let cached: DriverSet | null = null;

export function getDrivers(): DriverSet {
  if (cached) return cached;
  const env = process.env;
  cached = {
    ad: choose<AdDriver>(!!env.META_ACCESS_TOKEN, () => new MetaLeadAdsDriver(), () => new MockAdDriver()),
    enrich: choose<EnrichDriver>(!!env.APOLLO_API_KEY, () => new ApolloEnrichDriver(), () => new MockEnrichDriver()),
    scrub: choose<ScrubDriver>(
      !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
      () => new TwilioScrubDriver(),
      () => new MockScrubDriver()
    ),
    call: choose<CallDriver>(!!env.RETELL_API_KEY, () => new RetellCallDriver(), () => new MockCallDriver()),
    calendar: choose<CalendarDriver>(
      hasCredentials() && isAuthorized(),
      () => new GoogleCalendarDriver(),
      () => new MockCalendarDriver()
    ),
    crm: choose<CrmDriver>(
      !!(env.NOTION_API_KEY && env.NOTION_LEADS_DB_ID),
      () => new NotionCrmDriver(),
      () => new MockCrmDriver()
    ),
  };
  return cached;
}

/** For /health and the runbook — which driver is live vs mock right now. */
export function driverSummary(): Record<string, string> {
  const d = getDrivers();
  return {
    ad: d.ad.name,
    enrich: d.enrich.name,
    scrub: d.scrub.name,
    call: d.call.name,
    calendar: d.calendar.name,
    crm: d.crm.name,
  };
}
