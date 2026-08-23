// Entity models mirroring the original NMRDealer Access schema (mdes.mdb).
// Only the fields the UI uses are typed; rows may carry more.

export interface Client {
  Id_Client: number
  Nik: string | null
  Company: string | null
  Name: string | null
  Gorod: string | null
  Ulica: string | null
  Email: string | null
  Tel: string | null
  balance: number | null
  saldo: number | null
  typeclient: number | null
  status: number | null
  Prim: string | null
}

export interface Order {
  Id_zakaz: number
  Numzak: number | null
  numzaks: string | null
  Id_Client: number | null
  company: string | null
  nik: string | null
  Id_faktura: number | null
  Id_color: number | null
  ZakDate: string | null
  dateplan: string | null
  SForm: number | null   // площадь, м²
  PForm: number | null   // периметр, м
  Nang: number | null    // углов
  statezak: number | null
  Status: number | null
  allprice: number | null
  prim: string | null
}

export interface Faktura {
  Id_faktura: number
  Name: string | null
  Kpr: number | null
  Sfakt: number | null
  price: number | null
  priced: number | null
  vfakt: boolean | null
  id_basecatalog: number | null
}

export interface MColor {
  Id_Color: number
  Name: string | null
  cod: number | null       // RGB integer
  id_catalog: number | null
}

export interface Sclad {
  id_sclad: number
  namesclad: string | null
  id_client: number | null
  status: number | null
}

export interface Component {
  id_index: number
  id_comp: number | null
  namecomp: string | null
  id_faktura: number | null
  id_color: number | null
  LAll: number | null
  LOst: number | null
  Lrezerv: number | null
  Lbrak: number | null
  edizmer: string | null
  sprice: number | null
  id_sclad: number | null
}

export interface User {
  id_man: number
  name: string | null
  uslog: string | null
  status: number | null
  id_group: number | null
}

export interface Status {
  id_statzak: number
  StatusZak: string | null
}

export interface Catalog {
  id_index: number
  namecatalog: string | null
  status: number | null
}

export interface Personal {
  id_personal: number
  namepers: string | null
  status: number | null
}
