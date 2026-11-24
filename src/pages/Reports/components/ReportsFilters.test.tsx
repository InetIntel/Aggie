import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReportFilters from "./ReportsFilters";

const mockOptions = {
  countries: [{ key: "IR", label: "Iran" }, { key: "SY", label: "Syria" }],
  asns: [{ key: "12880", label: "AS12880 DCI" }],
  regions: [{ key: "IR-07", label: "Tehran" }],
  networks: [],
};

jest.mock("../../../api/reports", () => ({ getAlertFilterOptions: async () => mockOptions }));
jest.mock("../../../api/sources", () => ({ getSources: async () => [] }));
jest.mock("../../../api/groups", () => ({ getAllGroups: async () => [] }));
jest.mock("../../../api/session", () => ({ getSession: async () => ({ role: "admin" }) }));

let container: HTMLDivElement;
let search = "";

const LocationProbe = () => {
  search = useLocation().search;
  return null;
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

async function render(url = "/", showLocationFilters = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed the cache so option labels are there on first render, not after a fetch.
  client.setQueryData(["alert-filter-options"], mockOptions);
  await act(async () => {
    ReactDOM.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <ReportFilters refetch={() => {}} isFetching={false} showLocationFilters={showLocationFilters} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
      container
    );
  });
}

const buttons = () => Array.from(document.querySelectorAll("button"));
const findButton = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
const options = () => Array.from(document.querySelectorAll('[role="menuitemcheckbox"]'));
const param = (key: string) => new URLSearchParams(search).get(key);

async function click(el: Element | undefined) {
  if (!el) throw new Error("element not found");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function type(input: HTMLInputElement, text: string) {
  // React tracks input values itself, so set the value through the native setter.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openCategory(label: string) {
  await click(findButton("Filter"));
  await click(findButton(label));
}

test("Alerts Filter menu shows Countries, ASNs and Regions", async () => {
  await render();
  await click(findButton("Filter"));
  const rows = Array.from(document.querySelectorAll('[role="menuitem"]')).map((r) => r.textContent);
  expect(rows).toEqual(expect.arrayContaining(["Countries", "ASNs", "Regions"]));
});

test("Reports Filter menu has no location rows", async () => {
  await render("/", false);
  await click(findButton("Filter"));
  const rows = Array.from(document.querySelectorAll('[role="menuitem"]')).map((r) => r.textContent);
  expect(rows).not.toContain("Countries");
  expect(rows).not.toContain("ASNs");
  expect(rows).not.toContain("Regions");
});

test("selecting a country sets the URL param, checks the option and adds a chip", async () => {
  await render();
  await openCategory("Countries");
  await click(options().find((o) => o.textContent === "Iran"));
  expect(param("countries")).toBe("IR");
  expect(options().find((o) => o.textContent === "Iran")?.getAttribute("aria-checked")).toBe("true");
  expect(document.querySelector('[title="Remove filter: Iran"]')).not.toBeNull();
});

test("search narrows the option list", async () => {
  await render();
  await openCategory("Countries");
  await type(document.querySelector('input[aria-label="Search Countries"]') as HTMLInputElement, "ira");
  expect(options().map((o) => o.textContent)).toEqual(["Iran"]);
});

test("removing a chip clears only that value", async () => {
  await render("/?countries=IR,SY");
  await click(document.querySelector('[title="Remove filter: Iran"]') ?? undefined);
  expect(param("countries")).toBe("SY");
});

test("All clears the category", async () => {
  await render("/?countries=IR");
  await openCategory("Countries");
  await click(findButton("All"));
  expect(param("countries")).toBeNull();
});

test("a selected key missing from the options still shows and is checked", async () => {
  await render("/?countries=XX");
  await openCategory("Countries");
  const unknown = options().find((o) => o.textContent === "XX");
  expect(unknown?.getAttribute("aria-checked")).toBe("true");
});
