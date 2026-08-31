import { applyPiiUnmaskToTools } from './client.js';

describe('applyPiiUnmaskToTools', () => {
  it('nie mutuje narzędzi gdy aliasMap jest pusta', () => {
    const execute = jest.fn();
    const tools = { tool_a: { execute } };

    applyPiiUnmaskToTools(tools, {});

    expect(tools.tool_a.execute).toBe(execute);
  });

  it('zastępuje alias w string argument przed wywołaniem execute', async () => {
    const execute = jest.fn().mockResolvedValue('ok');
    const tools = { check_vat: { execute } };
    const aliasMap = { '<PL_NIP_1>': '1234567890' };

    applyPiiUnmaskToTools(tools, aliasMap);

    await tools.check_vat.execute({ nip: '<PL_NIP_1>' }, {});

    expect(execute).toHaveBeenCalledWith({ nip: '1234567890' }, {});
  });

  it('zastępuje aliasy rekurencyjnie w zagnieżdżonych obiektach', async () => {
    const execute = jest.fn().mockResolvedValue('ok');
    const tools = { search: { execute } };
    const aliasMap = {
      '<PL_NIP_1>': '1234567890',
      '<EMAIL_ADDRESS_1>': 'jan@example.com',
    };

    applyPiiUnmaskToTools(tools, aliasMap);

    await tools.search.execute(
      { query: { nip: '<PL_NIP_1>', email: '<EMAIL_ADDRESS_1>' } },
      {},
    );

    expect(execute).toHaveBeenCalledWith(
      { query: { nip: '1234567890', email: 'jan@example.com' } },
      {},
    );
  });

  it('zastępuje aliasy w tablicach string', async () => {
    const execute = jest.fn().mockResolvedValue('ok');
    const tools = { bulk: { execute } };
    const aliasMap = { '<PL_NIP_1>': '1111111111', '<PL_NIP_2>': '2222222222' };

    applyPiiUnmaskToTools(tools, aliasMap);

    await tools.bulk.execute({ nips: ['<PL_NIP_1>', '<PL_NIP_2>'] }, {});

    expect(execute).toHaveBeenCalledWith(
      { nips: ['1111111111', '2222222222'] },
      {},
    );
  });

  it('nie zmienia wartości numerycznych i boolean', async () => {
    const execute = jest.fn().mockResolvedValue('ok');
    const tools = { tool: { execute } };
    const aliasMap = { '<PL_NIP_1>': '1234567890' };

    applyPiiUnmaskToTools(tools, aliasMap);

    await tools.tool.execute(
      { count: 42, active: true, nip: '<PL_NIP_1>' },
      {},
    );

    expect(execute).toHaveBeenCalledWith(
      { count: 42, active: true, nip: '1234567890' },
      {},
    );
  });

  it('pomija narzędzia bez metody execute', () => {
    const tools = { static_tool: { description: 'no execute' } };

    expect(() =>
      applyPiiUnmaskToTools(tools, { '<PL_NIP_1>': '123' }),
    ).not.toThrow();
    expect(tools.static_tool).toEqual({ description: 'no execute' });
  });

  it('podmienia wiele aliasów w jednym stringu', async () => {
    const execute = jest.fn().mockResolvedValue('ok');
    const tools = { tool: { execute } };
    const aliasMap = {
      '<PL_NIP_1>': '1234567890',
      '<PL_PESEL_1>': '93111111112',
    };

    applyPiiUnmaskToTools(tools, aliasMap);

    await tools.tool.execute(
      { info: 'NIP: <PL_NIP_1>, PESEL: <PL_PESEL_1>' },
      {},
    );

    expect(execute).toHaveBeenCalledWith(
      { info: 'NIP: 1234567890, PESEL: 93111111112' },
      {},
    );
  });
});
