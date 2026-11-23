// Blue work–style map pins: a colored circle per lead status with a white icon,
// shrinking to small dots when zoomed out. Shared by the D2D map and the team map.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import {
  Sparkles, MessageCircle, Clock, DoorClosed, FileText, CalendarDays, DollarSign,
  CheckCircle2, X, ThumbsDown, Ban, HelpCircle, ShieldAlert, MoreHorizontal, User,
} from 'lucide-react'

// Default lead statuses (same set as Blue work). key = value stored on knocks.status
export const LEAD_STATUSES = [
  { key: 'new',        label: 'Nouveau',      en: 'New lead',   color: '#3b82f6', Icon: Sparkles },
  { key: 'not_home',   label: 'Absent',       en: 'Not home',   color: '#f59e0b', Icon: DoorClosed },
  { key: 'contacted',  label: 'Contacté',     en: 'Contacted',  color: '#06b6d4', Icon: MessageCircle },
  { key: 'follow_up',  label: 'Suivi',        en: 'Follow up',  color: '#a855f7', Icon: Clock },
  { key: 'quote',      label: 'Soumission',   en: 'Quote',      color: '#6366f1', Icon: FileText },
  { key: 'scheduled',  label: 'Planifié',     en: 'Scheduled',  color: '#0ea5e9', Icon: CalendarDays },
  { key: 'sale',       label: 'Vente',        en: 'Sale',       color: '#22c55e', Icon: DollarSign },
  { key: 'completed',  label: 'Complété',     en: 'Completed',  color: '#10b981', Icon: CheckCircle2 },
  { key: 'uncertain',  label: 'Incertain',    en: 'Uncertain',  color: '#eab308', Icon: HelpCircle },
  { key: 'no',         label: 'Non',          en: 'No',         color: '#ef4444', Icon: ThumbsDown },
  { key: 'lost',       label: 'Perdu',        en: 'Lost',       color: '#b91c1c', Icon: Ban },
  { key: 'cancelled',  label: 'Annulé',       en: 'Cancelled',  color: '#64748b', Icon: X },
  { key: 'avoid',      label: 'À éviter',     en: 'Avoid',      color: '#1f2937', Icon: ShieldAlert },
  { key: 'other',      label: 'Autre',        en: 'Other',      color: '#94a3b8', Icon: MoreHorizontal },
]

// Old knock statuses → new ones (the backend also migrates stored rows)
export const LEGACY_STATUS = {
  knocked: 'contacted', answered: 'contacted', interested: 'follow_up', not_interested: 'no',
}

export const STATUS_BY_KEY = Object.fromEntries(LEAD_STATUSES.map((s) => [s.key, s]))

export function statusOf(key) {
  return STATUS_BY_KEY[LEGACY_STATUS[key] || key] || STATUS_BY_KEY.other
}

// Below this zoom level pins become dots (like Blue work)
export const DOT_ZOOM = 15

const iconSvgCache = new Map()
function iconSvg(Icon) {
  if (!iconSvgCache.has(Icon)) {
    iconSvgCache.set(Icon, renderToStaticMarkup(
      React.createElement(Icon, { size: 16, color: 'white', strokeWidth: 2.4 })
    ))
  }
  return iconSvgCache.get(Icon)
}

const pinCache = new Map()

/** Circle pin with a white icon; `dot` = small dot for zoomed-out views. */
export function circlePin(color, Icon, { dot = false, size = 32, ring = null } = {}) {
  const k = `${color}|${Icon?.displayName || Icon?.name}|${dot}|${size}|${ring}`
  if (pinCache.has(k)) return pinCache.get(k)
  let icon
  if (dot) {
    icon = L.divIcon({
      className: '',
      html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:1.5px solid #fff;box-shadow:0 1px 3px rgba(15,23,42,.35)${ring ? `,0 0 0 2.5px ${ring}` : ''}"></div>`,
      iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -8],
    })
  } else {
    const half = size / 2
    icon = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};
        border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,.45)${ring ? `,0 0 0 3px ${ring}` : ''};
        display:flex;align-items:center;justify-content:center">${Icon ? iconSvg(Icon) : ''}</div>`,
      iconSize: [size, size], iconAnchor: [half, half], popupAnchor: [0, -half - 2],
    })
  }
  pinCache.set(k, icon)
  return icon
}

/** Pin for a knock / lead status key. */
export function statusPin(key, dot = false) {
  const s = statusOf(key)
  return circlePin(s.color, s.Icon, { dot })
}

/** Pins for existing customers on the map: customer / booked / done. */
export function customerPin(kind, dot = false) {
  if (kind === 'done') return circlePin(STATUS_BY_KEY.completed.color, CheckCircle2, { dot })
  if (kind === 'booked') return circlePin(STATUS_BY_KEY.scheduled.color, CalendarDays, { dot })
  return circlePin('#5b8eff', User, { dot })
}
