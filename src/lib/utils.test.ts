import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  csvEscape,
  initials,
  percent,
  roleHome,
  todayISO,
} from "./utils";

describe("utils", () => {
  it("genera iniciales legibles", () => {
    expect(initials("Ana María Torres")).toBe("AM");
    expect(initials("  ")).toBe("CD");
    expect(initials(null)).toBe("CD");
  });

  it("redirige a cada rol a su pantalla principal", () => {
    expect(roleHome("operador")).toBe("/app/operador");
    expect(roleHome("empleado")).toBe("/app/mi-qr");
    expect(roleHome("admin")).toBe("/app/dashboard");
    expect(roleHome(null)).toBe("/app/dashboard");
  });

  it("calcula porcentajes acotados entre 0 y 100", () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 3)).toBe(100);
  });

  it("escapa valores para CSV", () => {
    expect(csvEscape("simple")).toBe("simple");
    expect(csvEscape("con, coma")).toBe('"con, coma"');
    expect(csvEscape('con "comillas"')).toBe('"con ""comillas"""');
    expect(csvEscape(null)).toBe("");
  });

  it("produce fechas ISO de Bogotá", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const tomorrow = addDaysISO(1);
    expect(tomorrow > todayISO()).toBe(true);
  });
});
