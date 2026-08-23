// Data-access layer. Today it serves the real rows exported from mdes.mdb as
// local JSON; later, swap `mockApi` for an HTTP implementation of the same
// `Api` interface and nothing else in the app changes.

import type {
  Client, Order, Faktura, MColor, Sclad, Component, User, Status, Catalog, Personal,
} from './types'

import clients from './data/client.json'
import orders from './data/zakaz.json'
import faktura from './data/faktura.json'
import colors from './data/mcolor.json'
import sclads from './data/sclad.json'
import components from './data/components.json'
import users from './data/sarusers.json'
import statuses from './data/statuszak.json'
import catalog from './data/catalog.json'
import personal from './data/personal.json'

const DELAY = 120 // ms — simulate network latency
function resp<T>(data: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(structuredClone(data)), DELAY))
}

export interface Api {
  login(login: string, pass: string): Promise<User | null>
  listOrders(): Promise<Order[]>
  getOrder(id: number): Promise<Order | undefined>
  listClients(): Promise<Client[]>
  getClient(id: number): Promise<Client | undefined>
  listFilms(): Promise<Faktura[]>
  listColors(): Promise<MColor[]>
  listWarehouses(): Promise<Sclad[]>
  listComponents(scladId?: number): Promise<Component[]>
  listUsers(): Promise<User[]>
  listStatuses(): Promise<Status[]>
  listCatalog(): Promise<Catalog[]>
  listPersonal(): Promise<Personal[]>
}

const C = clients as unknown as Client[]
const O = orders as unknown as Order[]
const F = faktura as unknown as Faktura[]
const M = colors as unknown as MColor[]
const S = sclads as unknown as Sclad[]
const K = components as unknown as Component[]
const U = users as unknown as User[]
const T = statuses as unknown as Status[]
const G = catalog as unknown as Catalog[]
const P = personal as unknown as Personal[]

export const mockApi: Api = {
  login(login, pass) {
    const u = U.find((x) => (x.uslog ?? '').toLowerCase() === login.toLowerCase())
    // mock: any non-empty password accepts a known login
    return resp(u && pass ? u : null)
  },
  listOrders: () => resp(O),
  getOrder: (id) => resp(O.find((o) => o.Id_zakaz === id)),
  listClients: () => resp(C),
  getClient: (id) => resp(C.find((c) => c.Id_Client === id)),
  listFilms: () => resp(F),
  listColors: () => resp(M),
  listWarehouses: () => resp(S),
  listComponents: (scladId) =>
    resp(scladId ? K.filter((k) => k.id_sclad === scladId) : K),
  listUsers: () => resp(U),
  listStatuses: () => resp(T),
  listCatalog: () => resp(G),
  listPersonal: () => resp(P),
}

export const api: Api = mockApi

// --- synchronous lookup helpers for display (names by id) -----------------
export const colorName = (id: number | null | undefined) =>
  M.find((c) => c.Id_Color === id)?.Name ?? '—'
export const filmName = (id: number | null | undefined) =>
  F.find((f) => f.Id_faktura === id)?.Name ?? '—'
export const statusName = (id: number | null | undefined) =>
  T.find((s) => s.id_statzak === id)?.StatusZak ?? '—'
export const colorRgb = (cod: number | null | undefined) => {
  if (cod == null) return '#888'
  // Access stores BGR integers; convert to #RRGGBB
  const b = (cod >> 16) & 0xff, g = (cod >> 8) & 0xff, r = cod & 0xff
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
