// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSampleProviders } from '@/adapters/sample-providers';
import { createReadinessService, type ReadinessService } from '@/application/readiness-service';
import { DEFAULT_CONFIG } from '@/domain/types';
import type { EscalationMark, EscalationMarks } from '@/ports';
import { AppFrame } from './AppFrame';
import { AppProvider } from './AppProvider';
import { MaterialEscalationView } from './MaterialEscalationView';
import { VisitDetailView } from './VisitDetailView';
import { VisitListView } from './VisitListView';

const clock = { now: () => '2026-11-08T21:00:00Z' };
const service = () => createReadinessService(createSampleProviders(clock, DEFAULT_CONFIG), DEFAULT_CONFIG);
const memoryMarks = (): EscalationMarks => {
  const values = new Map<string, EscalationMark>();
  const key = (visitId: string, productId: string | null) => `${visitId}|${productId}`;
  return {
    list: () => [...values.values()],
    save: (marks) => {
      for (const mark of marks) values.set(key(mark.visitId, mark.productId), mark);
      return true;
    },
    remove: (visitId, productId) => values.delete(key(visitId, productId)),
  };
};

const COLLAR_110 = 'fireco-sl-collar-110mm-retrofit-collar';
const COLLAR_55 = 'fireco-sl-collar-55mm-retrofit-collar';

const renderApp = (ui: React.ReactNode, options: { service?: ReadinessService; marks?: EscalationMarks } = {}) =>
  render(
    <AppProvider service={options.service ?? service()} marks={options.marks ?? memoryMarks()}>
      <AppFrame>{ui}</AppFrame>
    </AppProvider>,
  );

describe('visit list', () => {
  it('shows a loading state, then visits', async () => {
    renderApp(<VisitListView />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByRole('heading', { name: 'Upcoming visits' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Today, Mon 9 Nov');
    const period = screen.getByRole('region', { name: 'Next 14 days' });
    expect(within(period).getByText('4 of 8 visits need action')).toBeInTheDocument();
    expect(within(period).getByRole('button', { name: /^Needs action/ })).toBeInTheDocument();
    expect(within(period).getByRole('heading', { name: 'Upcoming visits' })).toBeInTheDocument();
  });

  it('always shows the sample data banner', () => {
    renderApp(<VisitListView />);
    expect(screen.getByText('Sample data.')).toBeInTheDocument();
  });

  it('warns on a failed load and recovers on retry', async () => {
    const working = service();
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockImplementation(() => working.load());
    renderApp(<VisitListView />, { service: { load } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Do not assume materials are available');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Upcoming visits' })).toBeInTheDocument();
  });

  it('filters by state, and offers a way back when nothing matches', async () => {
    renderApp(<VisitListView />);
    await screen.findByRole('heading', { name: 'Upcoming visits' });

    const visits = () => document.querySelectorAll('.calendar-chip').length;
    await userEvent.click(screen.getByRole('button', { name: /^Ready 3/ }));
    expect(visits()).toBe(3);

    await userEvent.click(screen.getByRole('button', { name: /^Depends on delivery/ }));
    expect(screen.getByText(/No visits match this filter/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all visits' }));
    expect(visits()).toBe(8);
  });

  it('AC17: a stat tile filters the calendar and the list, and a second click clears it', async () => {
    renderApp(<VisitListView />);
    await screen.findByRole('heading', { name: 'Upcoming visits' });
    const tile = screen.getByRole('button', { name: /^Needs action/ });

    await userEvent.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.calendar-chip')).toHaveLength(4);

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(document.querySelectorAll('.visit-row')).toHaveLength(4);

    await userEvent.click(tile);
    expect(document.querySelectorAll('.visit-row')).toHaveLength(8);
  });

  it('AC22: shows today\'s visits at the top', async () => {
    renderApp(<VisitListView />);
    const panel = await screen.findByRole('region', { name: /^Today, Mon 9 Nov/ });
    expect(within(panel).getByText('1 visit today, ready')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /^V-101,/ })).toBeInTheDocument();
  });

  it('AC22: with no visits today, shows the next day', async () => {
    window.localStorage.setItem('qantum-tl.leader', 'leader-south');
    renderApp(<VisitListView />);
    const panel = await screen.findByRole('region', { name: /^Today/ });
    expect(within(panel).getByText('No visits today')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Next: In 3 days, Thu 12 Nov' })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('AC15: links to the next visit needing action', async () => {
    renderApp(<VisitListView />);
    const next = await screen.findByRole('link', { name: /Act on next/ });
    expect(next).toHaveAttribute('href', expect.stringContaining('V-104'));
  });

  it('names the materials to chase', async () => {
    renderApp(<VisitListView />);
    const panel = await screen.findByRole('region', { name: 'Materials to chase' });
    expect(within(panel).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Short 10 of 15 each · for your visit on Thu 12 Nov/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is planned', async () => {
    const providers = createSampleProviders(clock, DEFAULT_CONFIG);
    const plan = await providers.plan.getPlan();
    providers.plan.getPlan = async () => ({ ...plan, visits: [], scenarios: [] });
    renderApp(<VisitListView />, { service: createReadinessService(providers, DEFAULT_CONFIG) });
    expect(await screen.findByText(/No visits are planned/)).toBeInTheDocument();
  });

  it('changes visits when the leader changes', async () => {
    renderApp(<VisitListView />);
    await screen.findByRole('heading', { name: 'Upcoming visits' });
    await userEvent.selectOptions(screen.getByLabelText('Viewing as'), 'leader-east');
    expect(screen.getAllByText('Waterfront Hotel').length).toBeGreaterThan(0);
    expect(screen.queryByText('Harbour Tower')).not.toBeInTheDocument();
  });
});

describe('visit detail', () => {
  it('leads with the decision and names the other team', async () => {
    window.localStorage.setItem('qantum-tl.leader', 'leader-south');
    renderApp(<VisitDetailView visitId="V-103" />);
    const decision = await screen.findByRole('region', { name: 'Readiness decision' });
    expect(within(decision).getByText(/^Short by 10 each:/)).toBeInTheDocument();
    expect(screen.getByText(/Planned use by V-102 \(Team North/)).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('shows a stale data warning and allows escalation', async () => {
    window.localStorage.setItem('qantum-tl.leader', 'leader-east');
    renderApp(<VisitDetailView visitId="V-112" />);
    expect(await screen.findByRole('heading', { name: 'Data warnings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Escalate this visit' })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('names other risks below the headline', async () => {
    renderApp(<VisitDetailView visitId="V-111" />);
    const decision = await screen.findByRole('region', { name: 'Readiness decision' });
    expect(within(decision).getByText(/^Also: .*SERVOWRAP.*depends on delivery$/)).toBeInTheDocument();
  });

  it('offers no escalation on a ready visit, and says Ready is not a reservation', async () => {
    renderApp(<VisitDetailView visitId="V-101" />);
    expect(await screen.findByText(/not a reservation/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Escalate this visit' })).not.toBeInTheDocument();
  });

  it('AC10: treats zero products as normal', async () => {
    renderApp(<VisitDetailView visitId="V-115" />);
    expect((await screen.findAllByText(/No products listed in catalogue/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Data warnings' })).not.toBeInTheDocument();
  });

  it('labels an approved alternative as a sample and keeps the visit short', async () => {
    renderApp(<VisitDetailView visitId="V-110" />);
    expect(await screen.findByText('Approved (sample record)')).toBeInTheDocument();
    expect(screen.getAllByText(/stays as it is until the nominated solution changes/).length).toBeGreaterThan(0);
  });

  it('refuses another team\'s visit with a way forward', async () => {
    renderApp(<VisitDetailView visitId="V-103" />);
    expect(await screen.findByRole('heading', { name: 'This visit belongs to another team' })).toBeInTheDocument();
    expect(screen.getByText(/Team South/)).toBeInTheDocument();
  });

  it('handles an unknown visit', async () => {
    renderApp(<VisitDetailView visitId="V-999" />);
    expect(await screen.findByRole('heading', { name: 'Visit not found' })).toBeInTheDocument();
  });
});

const marksShown = () => [...document.querySelectorAll('.item-mark')].map((item) => item.textContent ?? '');

describe('escalation composer', () => {
  const open = async (visitId = 'V-104', marks?: EscalationMarks) => {
    renderApp(<VisitDetailView visitId={visitId} />, { marks });
    return screen.findByRole('heading', { name: 'Escalate this visit' });
  };
  const preview = () => screen.getByLabelText('Escalation message preview');
  const decision = () => screen.getByRole('region', { name: 'Readiness decision' });

  it('defaults the request to the problem and writes a specific ask', async () => {
    await open();
    expect(preview()).toHaveTextContent('Request: Confirm priority');
    expect(preview()).toHaveTextContent('Please decide which visit gets the stock.');
    await userEvent.selectOptions(screen.getByLabelText('What do you need?'), 'EXPEDITE_SUPPLY');
    expect(preview()).toHaveTextContent(/Please get 10 each of FIRECO SL COLLAR 110mm Retrofit Collar to Central yard/);
    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Crew booked');
    expect(preview()).toHaveTextContent('Note: Crew booked');
  });

  it('offers only requests that fit this visit', async () => {
    await open('V-111');
    const options = within(screen.getByLabelText('What do you need?')).getAllByRole('option').map((item) => item.textContent);
    expect(options).toEqual(['Expedite supply', 'Confirm delivery']);
    expect(screen.getByText(/Needs a different request: .*SERVOWRAP.*\(Confirm delivery\)/)).toBeInTheDocument();
  });

  it('offers copying, and no email draft', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: /email/i })).not.toBeInTheDocument();
  });

  it('explains when copying is unavailable', async () => {
    await open();
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    await waitFor(() => expect(screen.getByText(/Copying is not available/)).toBeInTheDocument());
  });

  it('asks for a selection, and cannot mark, when everything is unchecked', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(preview()).toHaveTextContent('Select at least one item to include.');
    expect(screen.getByRole('button', { name: /mark .* as escalated/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
  });

  it('AC18: marks products one request at a time, from partly to fully escalated, and can remove a mark', async () => {
    await open('V-111');
    await userEvent.click(screen.getByRole('button', { name: 'I\'ve sent it: mark it as escalated' }));
    expect(within(decision()).getByText('Partly escalated')).toBeInTheDocument();
    expect(marksShown()).toEqual([expect.stringMatching(/Escalated .*\(Expedite supply\)/)]);
    expect(screen.getByRole('button', { name: 'Marked as escalated' })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('What do you need?'), 'CONFIRM_DELIVERY');
    expect(preview()).toHaveTextContent(/Please confirm that 6 rolls of FIRECO SERVOWRAP/);
    await userEvent.click(screen.getByRole('button', { name: 'I\'ve sent it: mark it as escalated' }));
    expect(within(decision()).getByText('Escalated')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Remove escalation mark for FIRECO SERVOWRAP/ }));
    expect(within(decision()).getByText('Partly escalated')).toBeInTheDocument();
  });

  it('AC18: the dashboard shows the mark and moves on to the next visit', async () => {
    const marks = memoryMarks();
    marks.save([{ visitId: 'V-104', productId: COLLAR_110, markedAt: '2026-11-09T00:00:00Z', request: 'CONFIRM_PRIORITY' }]);
    renderApp(<VisitListView />, { marks });
    const next = await screen.findByRole('link', { name: /Act on next/ });
    expect(next).toHaveAttribute('href', expect.stringContaining('V-109'));
    expect(screen.getByRole('button', { name: /^Needs action/ })).toHaveTextContent('1 escalated');
    expect(screen.getByRole('link', { name: /^V-104,.*\. Escalated$/ })).toBeInTheDocument();
  });

  it('AC13: explains when the mark cannot be saved and keeps working', async () => {
    await open('V-104', { list: () => [], save: () => false, remove: () => false });
    await userEvent.click(screen.getByRole('button', { name: /mark it as escalated/ }));
    expect(screen.getByText(/could not be saved/)).toBeInTheDocument();
    expect(within(decision()).getByText('Escalated')).toBeInTheDocument();
  });
});

describe('product escalation', () => {
  afterEach(() => window.localStorage.clear());

  it('AC19: escalates one product across the leader\'s visits, from the dashboard link', async () => {
    window.localStorage.setItem('qantum-tl.leader', 'leader-south');
    renderApp(<VisitListView />);
    const link = await screen.findByRole('link', { name: 'Escalate FIRECO SL COLLAR 55mm Retrofit Collar' });
    expect(link.getAttribute('href')).toContain(`/materials/${COLLAR_55}`);
  });

  it('AC19: one message covers every selected visit, and marking covers them all', async () => {
    window.localStorage.setItem('qantum-tl.leader', 'leader-south');
    renderApp(<MaterialEscalationView productId={COLLAR_55} />);
    expect(await screen.findByRole('heading', { name: 'FIRECO SL COLLAR 55mm Retrofit Collar', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByLabelText('Escalation message preview')).toHaveTextContent('for 2 visits');

    await userEvent.click(screen.getByRole('button', { name: 'I\'ve sent it: mark 2 items as escalated' }));
    expect(marksShown()).toHaveLength(2);
    window.localStorage.clear();
  });

  it('says when the product has no problems on the leader\'s visits', async () => {
    renderApp(<MaterialEscalationView productId={COLLAR_55} />);
    expect(await screen.findByRole('heading', { name: 'Nothing to escalate for this product' })).toBeInTheDocument();
  });
});
