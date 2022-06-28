import { client } from '../helpers/mock-client'
import { Client } from "$lib/client";
import { Search, RawSearch } from "$lib/search";

import { simpleHashSchema, SimpleHashEntity } from "../helpers/test-entity-and-schema";
import { mockClientSearchToReturnNothing, mockClientSearchToReturnSingleKey,
  SIMPLE_ENTITY_1 } from '../helpers/search-helpers';

console.warn = vi.fn();


type HashSearch = Search<SimpleHashEntity> | RawSearch<SimpleHashEntity>;

describe.each([
  [ "FluentSearch",
    new Search<SimpleHashEntity>(simpleHashSchema, new Client()) ],
  [ "RawSearch",
    new RawSearch<SimpleHashEntity>(simpleHashSchema, new Client()) ]
])("%s", (_, search: HashSearch) => {

  describe("#returnMinId", () => {
    let id: string | null;
    let indexName = 'SimpleHashEntity:index', query = '*';

    describe("when querying no results", () => {
      beforeEach( async () => {
        mockClientSearchToReturnNothing();
        id = await search.return.minId('aNumber');
      });

      it("asks the client for the first result of a given repository", () => {
        expect(client.search).toHaveBeenCalledTimes(1);
        expect(client.search).toHaveBeenCalledWith({
          indexName,
          query,
          limit: { offset: 0, count: 1 },
          sort: { field: 'aNumber', order: 'ASC' },
          keysOnly: true
        });
      });

      it("return no result", () => expect(id).toBe(null));
    });

    describe("when getting a result", () => {
      beforeEach(async () => {
        mockClientSearchToReturnSingleKey();
        id = await search.return.minId('aNumber');
      });

      it("asks the client for the first result of a given repository", () => {
        expect(client.search).toHaveBeenCalledTimes(1)
        expect(client.search).toHaveBeenCalledWith({
          indexName,
          query,
          limit: { offset: 0, count: 1 },
          sort: { field: 'aNumber', order: 'ASC' },
          keysOnly: true
        });
      });

      it("returns the first result of a given repository", () => {
        expect(id).toEqual(SIMPLE_ENTITY_1.entityId);
      });
    });
  });
});
