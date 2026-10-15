// Records the Nova Poshta API 2.0 answers the client tests and the fixture transport replay
// (src/lib/delivery/nova-poshta/fixtures/recordings.json). Run by hand when the API changes:
//   node tests/delivery/record-nova-poshta-fixtures.mjs
// Always without a key (the Address methods and getDocumentPrice answer without one), so no key can end up in
// the file. Branch records keep only the fields the client reads; the rest of the answer is as recorded.
import { writeFileSync } from "node:fs";

const API_URL = "https://api.novaposhta.ua/v2.0/json/";
const OUT = new URL("../../src/lib/delivery/nova-poshta/fixtures/recordings.json", import.meta.url);

const KYIV = { settlement: "e718a680-4b33-11e4-ab6d-005056801329", city: "8d5a980d-391c-11dd-90d9-001a92567626" };
const LVIV = { settlement: "e71abb60-4b33-11e4-ab6d-005056801329", city: "db5c88f5-391c-11dd-90d9-001a92567626" };
const ODESA = { city: "db5c88d0-391c-11dd-90d9-001a92567626" };

const TYPE = {
  post: "841339c7-591a-42e2-8233-7a0a00f0ed6f",
  cargo: "9a68df70-0267-42a8-bb5c-37f427e36ee4",
  parcelShop: "6f8c7162-4b72-4b0a-88e5-906948c6a92f",
  postomat: "f9316480-5f2d-425d-bc2c-ac7cd29decf0",
  privatPostomat: "95dc212d-479c-4ffb-a8ab-8c1b9073d0bc",
};

const WAREHOUSE_FIELDS = [
  "Ref",
  "Number",
  "Description",
  "ShortAddress",
  "TypeOfWarehouse",
  "CategoryOfWarehouse",
  "CityRef",
  "CityDescription",
  "SettlementRef",
  "SettlementDescription",
  "WarehouseStatus",
  "DenyToSelect",
  "TotalMaxWeightAllowed",
  "PlaceMaxWeightAllowed",
  "MaxDeclaredCost",
  "ReceivingLimitationsOnDimensions",
  "Schedule",
];

const settlements = (CityName, Limit = "10") => ({
  modelName: "AddressGeneral",
  calledMethod: "searchSettlements",
  methodProperties: { CityName, Limit, Page: "1" },
});
const warehouses = (props) => ({
  modelName: "AddressGeneral",
  calledMethod: "getWarehouses",
  methodProperties: { Limit: "20", Page: "1", Language: "UA", ...props },
});
const streets = (SettlementRef, StreetName) => ({
  modelName: "Address",
  calledMethod: "searchSettlementStreets",
  methodProperties: { SettlementRef, StreetName, Limit: "20", Page: "1" },
});
const price = (CityRecipient, ServiceType, Weight, CitySender = KYIV.city) => ({
  modelName: "InternetDocument",
  calledMethod: "getDocumentPrice",
  methodProperties: { CitySender, CityRecipient, Weight, ServiceType, Cost: "1289", CargoType: "Parcel", SeatsAmount: "1" },
});

const requests = [
  settlements("Київ"),
  settlements("Ки"),
  settlements("Львів"),
  settlements("Одеса"),
  settlements("Бровари"),
  settlements("zzzz-no-such-place"),
  settlements(""),
  ...[KYIV, LVIV].flatMap(({ settlement }) =>
    Object.values(TYPE).map((type) => warehouses({ SettlementRef: settlement, TypeOfWarehouseRef: type })),
  ),
  warehouses({ SettlementRef: KYIV.settlement }),
  warehouses({ SettlementRef: KYIV.settlement, FindByString: "Хрещатик" }),
  warehouses({ SettlementRef: KYIV.settlement, WarehouseId: "1" }),
  warehouses({ SettlementRef: KYIV.settlement, WarehouseId: "1001", TypeOfWarehouseRef: TYPE.postomat }),
  streets(KYIV.settlement, "Хрещатик"),
  streets(KYIV.settlement, "Шевченка"),
  streets(LVIV.settlement, "Шевченка"),
  streets(KYIV.settlement, "zzzz-no-such-street"),
  ...[LVIV.city, KYIV.city, ODESA.city].flatMap((city) =>
    ["WarehouseWarehouse", "WarehousePostomat", "WarehouseDoors"].flatMap((service) =>
      ["0.1", "0.5", "1", "2"].map((weight) => price(city, service, weight)),
    ),
  ),
  price("00000000-0000-0000-0000-000000000000", "WarehouseWarehouse", "0.5"),
];

function trim(request, response) {
  if (request.calledMethod !== "getWarehouses" || !Array.isArray(response.data)) return response;
  const data = response.data.map((row) => Object.fromEntries(WAREHOUSE_FIELDS.filter((f) => f in row).map((f) => [f, row[f]])));
  return { ...response, data };
}

const recordings = [];
for (const request of requests) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "", ...request }),
  });
  const response = await res.json();
  recordings.push({ request, response: trim(request, response) });
  console.log(request.calledMethod, JSON.stringify(request.methodProperties), response.success, response.errors);
}

writeFileSync(OUT, `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), recordings }, null, 1)}\n`);
console.log(`${recordings.length} recordings → ${OUT.pathname}`);
