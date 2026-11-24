import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeMonotonic } from "../testing/helpers.js";
import { ActiveTimeMeter } from "./meter.js";

function setup() {
  const clock = new FakeMonotonic();
  return { clock, meter: new ActiveTimeMeter(clock.now) };
}

test("no cuenta antes de empezar", () => {
  const { clock, meter } = setup();
  clock.advance(30);
  assert.equal(meter.activeSeconds, 0);
});

test("cuenta mientras la charla está activa y devuelve segundos completos", () => {
  const { clock, meter } = setup();
  meter.start();
  clock.advance(90.9);
  assert.equal(meter.activeSeconds, 90);
});

test("la pausa no descuenta", () => {
  const { clock, meter } = setup();
  meter.start();
  clock.advance(60);
  meter.pause();
  clock.advance(600);
  meter.resume();
  clock.advance(30);
  assert.equal(meter.activeSeconds, 90);
});

test("el tiempo sin conexión no descuenta y al reconectar sigue contando", () => {
  const { clock, meter } = setup();
  meter.start();
  clock.advance(120);
  meter.disconnect();
  clock.advance(45);
  meter.reconnect();
  clock.advance(15);
  assert.equal(meter.activeSeconds, 135);
});

test("pausar durante un corte: al reconectar sigue pausado hasta reanudar", () => {
  const { clock, meter } = setup();
  meter.start();
  clock.advance(10);
  meter.disconnect();
  meter.pause();
  meter.reconnect();
  clock.advance(100);
  assert.equal(meter.activeSeconds, 10);
  meter.resume();
  clock.advance(5);
  assert.equal(meter.activeSeconds, 15);
});

test("los silencios con la conexión abierta sí cuentan", () => {
  const { clock, meter } = setup();
  meter.start();
  clock.advance(180);
  assert.equal(meter.activeSeconds, 180);
});

test("al terminar deja de contar para siempre", () => {
  const { clock, meter } = setup();
  meter.start();
  clock.advance(20);
  meter.stop();
  clock.advance(500);
  meter.resume();
  meter.reconnect();
  clock.advance(500);
  assert.equal(meter.activeSeconds, 20);
  assert.equal(meter.isRunning, false);
});

test("repetir start, pause o resume no cambia el resultado", () => {
  const { clock, meter } = setup();
  meter.start();
  meter.start();
  clock.advance(10);
  meter.pause();
  meter.pause();
  clock.advance(10);
  meter.resume();
  meter.resume();
  clock.advance(10);
  assert.equal(meter.activeSeconds, 20);
});

test("un reloj que retrocede nunca resta tiempo", () => {
  const { clock, meter } = setup();
  clock.advance(100);
  meter.start();
  clock.advance(10);
  clock.ms -= 50;
  assert.ok(meter.activeMs >= 0);
  assert.ok(meter.activeSeconds <= 10);
});

test("dos charlas seguidas se miden por separado", () => {
  const clock = new FakeMonotonic();
  const first = new ActiveTimeMeter(clock.now);
  first.start();
  clock.advance(60);
  first.stop();
  const second = new ActiveTimeMeter(clock.now);
  second.start();
  clock.advance(30);
  assert.equal(first.activeSeconds, 60);
  assert.equal(second.activeSeconds, 30);
});
