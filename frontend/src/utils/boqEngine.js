// PEB BOQ Calculation Engine — mirrors Excel STR&NON STR (2) + ABSTRACT-PEB (3)

export const RATES = {
  structural_steel:  110,
  bare_galvalume:     59,
  puf_panel_roof:    180,
  puf_panel_wall:    181,
  ridge_flashing:    110,
  polycarbonate:     110,
  mezzanine_decking: 154,
};

export const STEEL_RATE_MAIN = 1.8;
export const STEEL_RATE_MEZZ = 3.4;

/**
 * Excel empirical adjustment formulas (NOT geometric slope calc).
 * adjL = L + 2 + (L / 3.281) * 0.1667
 * adjW = W + 2 + (W / 10) * 0.33
 */
export function slopeAdjust(L, W) {
  const adjL = L + 2 + (L / 3.281) * 0.1667;
  const adjW = W + 2 + (W / 10) * 0.33;
  return { adjL, adjW };
}

export function calcBOQ(form) {
  const L = +form.building_length, W = +form.building_width;
  const H = +form.full_height, Hw = +form.wall_height;
  const hasMezz = form.mezzanine_required;
  const mL = hasMezz ? +form.mezz_length : 0;
  const mW = hasMezz ? +form.mezz_width : 0;
  const rt = form.roof_type;

  // --- Steel Tonnage ---
  const steelRateMain = +(form.steel_rate_main || STEEL_RATE_MAIN);
  const steelRateMezz = +(form.steel_rate_mezz || STEEL_RATE_MEZZ);
  const mainArea = L * W;
  const mainKg   = mainArea * steelRateMain;
  const mezzArea = hasMezz ? mL * mW : 0;
  const mezzKg   = hasMezz ? mezzArea * steelRateMezz : 0;
  const totalKg  = mainKg + mezzKg;

  // --- Cladding Height H2 = (full_height - wall_height) + 3 ---
  const H2 = (H - Hw) + 3;

  // --- Roof & Cladding Areas (Excel empirical formulas) ---
  const { adjL, adjW } = slopeAdjust(L, W);
  const roofArea = adjL * adjW;

  // Cladding on ALL 4 SIDES using H2
  const northClad = adjL * H2;
  const southClad = adjL * H2;
  const eastClad  = adjW * H2;
  const westClad  = adjW * H2;

  // Triangular gable area: Excel = 2 * W * (W / 2 / 10)
  const triArea = rt === "gable" ? 2 * W * (W / 2 / 10) : 0;

  // Canopy area: Excel = (L / 100) * 25 * 8
  const canopyArea = (L / 100) * 25 * 8;

  // Lighting deduction (negative): Excel = 2 * (L/20) * (-1) * 3.25 * 10
  const lightDeduction = 2 * (L / 20) * (-1) * 3.25 * 10;

  // Total cladding (sides only)
  const totalCladArea = northClad + southClad + eastClad + westClad + triArea;

  // Total qty J18 = SUM(roof + N + S + E + W + tri + canopy + lightDeduct)
  const totalQty = roofArea + totalCladArea + canopyArea + lightDeduction;

  // Lighting sheet qty (polycarbonate): Excel formula
  const lightSheetQty = 2 * (L / 20) * (3.25 + 0.667 + 0.667) * (0.667 + 0.667 + 10);

  // PUF roof qty = roofArea + lightDeduction (deduction is negative)
  const pufRoofArea = roofArea + lightDeduction;

  // PUF side cladding qty = totalQty + lightDeduction - roofArea
  const pufSideArea = totalQty + lightDeduction - roofArea;

  // Ridge/flashing Rft: Excel complex formula
  const ridgeRft = (adjL * 3) + (H2 * 4) + (3 * 2 * H)
    + ((adjL + adjW) * 2) + (adjW * 2)
    + (25 * 2) + (8 * 2) + (8 * 4) + 200;

  // --- Build rates from form (with defaults) ---
  const rates = {};
  for (const [k, v] of Object.entries(RATES)) {
    rates[k] = +form[`rate_${k}`] || v;
  }

  // --- Build ABSTRACT-PEB(3) format items ---
  const items = [];

  // 1. STRUCTURAL STEEL WORKS
  items.push({
    item_no: "1", category: "STRUCTURAL STEEL WORKS",
    description: "Supplying, fabrication and erecting in position for all structural member using MS Sections for Trusses, Base plate, Cap plate, connection plates, EN8 Anchor bolts, Cold formed Purlins, etc., including making connection, aligning, Cleaning etc., with one coat of zinc chromate metal primer and two coats of enamel paint. Conveyance and fixing charges etc., complete.\n(All Structural members, Purlin, Sag rods, connection plates & Bolts etc considered)",
    unit: "Kg", quantity: +totalKg.toFixed(2),
    rate: rates.structural_steel, amount: +(totalKg * rates.structural_steel).toFixed(2),
  });

  // 2.01 — Bare galvalume (total qty from J18)
  items.push({
    item_no: "2.01", category: "ROOFING & SIDE CLADDING WORKS",
    description: "Supplying and laying of BARE galvalume sheet 0.47mm thickness for Roofing & profiled COLOUR coated galvalume sheet 0.47mm thickness for side cladding with necessary sealant, EPDM metal washers, Bolt and nuts, necessary flashings etc., complete.",
    unit: "Sqft", quantity: +totalQty.toFixed(2),
    rate: rates.bare_galvalume, amount: +(totalQty * rates.bare_galvalume).toFixed(2),
  });

  // 2.02 — PUF panel for ROOF only
  items.push({
    item_no: "2.02", category: "ROOFING & SIDE CLADDING WORKS",
    description: "Supplying and laying of PUF panel 30MM thickness for ROOF with necessary sealant, EPDM metal washers, Bolt and nuts, necessary flashings etc., complete.",
    unit: "Sqft", quantity: +pufRoofArea.toFixed(2),
    rate: rates.puf_panel_roof, amount: +(pufRoofArea * rates.puf_panel_roof).toFixed(2),
  });

  // 3.02 — PUF panel for SIDE CLADDING only
  items.push({
    item_no: "3.02", category: "ROOFING & SIDE CLADDING WORKS",
    description: "Supplying and laying of PUF panel 30MM thickness for SIDE CLADDING with necessary sealant, EPDM metal washers, Bolt and nuts, necessary flashings etc., complete.",
    unit: "Sqft", quantity: +pufSideArea.toFixed(2),
    rate: rates.puf_panel_wall, amount: +(pufSideArea * rates.puf_panel_wall).toFixed(2),
  });

  // 2.03 — Ridge, L Flash, Trip Flash, Gutter, Downspout
  items.push({
    item_no: "2.03", category: "ROOFING & SIDE CLADDING WORKS",
    description: "Supplying and laying of profiled colour coated galvalume sheet 0.47mm thickness with 550 MPA for Ridge, L Flash, Trip Flash, Gutter, Downspout., etc.",
    unit: "Rft", quantity: +ridgeRft.toFixed(2),
    rate: rates.ridge_flashing, amount: +(ridgeRft * rates.ridge_flashing).toFixed(2),
  });

  // 2.04 — Polycarbonate lighting sheet
  items.push({
    item_no: "2.04", category: "ROOFING & SIDE CLADDING WORKS",
    description: "Supplying and laying of POLYCARBONATE SHEET (Lighting sheet) 1.5mm thickness including making connection, aligning, Cleaning etc.",
    unit: "Sqft", quantity: +lightSheetQty.toFixed(2),
    rate: rates.polycarbonate, amount: +(lightSheetQty * rates.polycarbonate).toFixed(2),
  });

  // 3. MEZZANINE WORKS (if applicable)
  if (hasMezz && mezzArea > 0) {
    items.push({
      item_no: "3.01", category: "MEZZANINE WORKS",
      description: "Providing mezzanine floor with decking sheet and concrete (100mm avg), including structural steel supports, complete.",
      unit: "Sqft", quantity: +mezzArea.toFixed(2),
      rate: rates.mezzanine_decking, amount: +(mezzArea * rates.mezzanine_decking).toFixed(2),
    });
  }

  const total   = +items.reduce((s, i) => s + i.amount, 0).toFixed(2);
  const flrArea = mainArea + mezzArea;
  const ratePerSqft = +(total / flrArea).toFixed(2);

  return {
    items, total_amount: total, floor_area: flrArea, rate_per_sqft: ratePerSqft, rates,
    steel_summary: { total_steel_kg: +totalKg.toFixed(2), total_steel_ton: +(totalKg / 1000).toFixed(3), main_steel_kg: +mainKg.toFixed(2), mezz_steel_kg: +mezzKg.toFixed(2), main_area_sqft: mainArea, mezz_area_sqft: mezzArea, steel_amount: +(totalKg * rates.structural_steel).toFixed(2) },
    cladding_summary: {
      adjL: +adjL.toFixed(2), adjW: +adjW.toFixed(2),
      roof_area_sqft: +roofArea.toFixed(2), wall_area_sqft: +totalCladArea.toFixed(2),
      ridge_rft: +ridgeRft.toFixed(2), lighting_sqft: +lightSheetQty.toFixed(2),
      floor_area_sqft: mainArea, H2: +H2.toFixed(2),
      pufRoofArea: +pufRoofArea.toFixed(2), pufSideArea: +pufSideArea.toFixed(2),
      totalQty: +totalQty.toFixed(2),
    },
  };
}
