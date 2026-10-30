import { describe, expect, it } from "vitest";
import { normalizeHeader, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("detecta coma y respeta campos entre comillas", () => {
    const result = parseCsv('codigo,nombre,observacion\nEMP-001,"Torres, Ana","Sin observación"\n');
    expect(result.delimiter).toBe(",");
    expect(result.headers).toEqual(["codigo", "nombre", "observacion"]);
    expect(result.rows).toEqual([
      { codigo: "EMP-001", nombre: "Torres, Ana", observacion: "Sin observación" },
    ]);
  });

  it("detecta punto y coma", () => {
    const result = parseCsv("codigo;nombre\nEMP-002;Carlos Ramírez\n");
    expect(result.delimiter).toBe(";");
    expect(result.rows[0]).toEqual({ codigo: "EMP-002", nombre: "Carlos Ramírez" });
  });

  it("detecta tabulaciones", () => {
    const result = parseCsv("codigo\tnombre\nEMP-003\tLaura Gómez\n");
    expect(result.delimiter).toBe("\t");
    expect(result.rows[0]?.nombre).toBe("Laura Gómez");
  });

  it("elimina BOM, tildes y caracteres especiales de los encabezados", () => {
    expect(normalizeHeader("\ufeffCódigo Empleado")).toBe("codigo_empleado");
    expect(normalizeHeader("Centro de costo (código)")).toBe("centro_de_costo_codigo");
  });

  it("soporta comillas escapadas", () => {
    const result = parseCsv('codigo,nombre\nEMP-004,"Andrés ""El Pibe"" Martínez"\n');
    expect(result.rows[0]?.nombre).toBe('Andrés "El Pibe" Martínez');
  });

  it("devuelve estructuras vacías para texto vacío", () => {
    expect(parseCsv("   ")).toEqual({ headers: [], rows: [], delimiter: "," });
  });
});
