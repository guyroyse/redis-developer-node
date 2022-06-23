import Client from '../../../lib/client';
import Schema from '../../../lib/schema/schema';
import Repository from '../../../lib/repository/repository';

import { SampleJsonEntity, createJsonEntitySchema } from '../helpers/data-helper';
import { fetchIndexHash, fetchIndexInfo, removeAll } from '../helpers/redis-helper';

describe("create and drop index on JSON", () => {

  let client: Client;
  let repository: Repository<SampleJsonEntity>;
  let schema: Schema<SampleJsonEntity>;
  let indexInfo: Array<string>;
  let indexHash: string;

  beforeAll(async () => {
    client = new Client();
    await client.open();

    schema = createJsonEntitySchema('create-drop-json');
    repository = client.fetchRepository<SampleJsonEntity>(schema);
  });

  afterAll(async () => {
    await removeAll(client, 'create-drop-json:');
    await repository.dropIndex()
    await client.close()
  });

  describe("when the index is created", () => {
    beforeEach(async () => {
      await removeAll(client, 'create-drop-json:');
      await repository.createIndex();
      indexInfo = await fetchIndexInfo(client, 'create-drop-json:index');
      indexHash = await fetchIndexHash(client, 'create-drop-json:index:hash');
    });

    it("has the expected name", () => {
      let indexName = indexInfo[1];
      expect(indexName).toBe('create-drop-json:index');
    });

    it("has the expected key type", () => {
      let keyType = indexInfo[5][1];
      expect(keyType).toBe('JSON');
    });

    it("has the expected prefixes", () => {
      let prefixes = indexInfo[5][3];
      expect(prefixes).toEqual(['create-drop-json:']);
    });

    it("has the expected hash", () => {
      expect(indexHash).toBe("p2zV8lqN3AUmui41o3PSkvLZ/XQ=");
    });

    it("has the expected fields", () => {
      let fields = indexInfo[7];
      expect(fields).toHaveLength(14);
      expect(fields).toEqual([
        ['identifier', '$.aString', 'attribute', 'aString', 'type', 'TAG', 'SEPARATOR', '|'],
        ['identifier', '$.anotherString', 'attribute', 'anotherString', 'type', 'TAG', 'SEPARATOR', '|'],
        ['identifier', '$.someText', 'attribute', 'someText', 'type', 'TEXT', 'WEIGHT', '1', 'SORTABLE'],
        ['identifier', '$.someOtherText', 'attribute', 'someOtherText', 'type', 'TEXT', 'WEIGHT', '1', 'SORTABLE'],
        ['identifier', '$.aNumber', 'attribute', 'aNumber', 'type', 'NUMERIC', 'SORTABLE'],
        ['identifier', '$.anotherNumber', 'attribute', 'anotherNumber', 'type', 'NUMERIC', 'SORTABLE'],
        ['identifier', '$.aBoolean', 'attribute', 'aBoolean', 'type', 'TAG', 'SEPARATOR', ''],
        ['identifier', '$.anotherBoolean', 'attribute', 'anotherBoolean', 'type', 'TAG', 'SEPARATOR', ''],
        ['identifier', '$.aPoint', 'attribute', 'aPoint', 'type', 'GEO'],
        ['identifier', '$.anotherPoint', 'attribute', 'anotherPoint', 'type', 'GEO'],
        ['identifier', '$.aDate', 'attribute', 'aDate', 'type', 'NUMERIC', 'SORTABLE'],
        ['identifier', '$.anotherDate', 'attribute', 'anotherDate', 'type', 'NUMERIC', 'SORTABLE'],
        ['identifier', '$.someStrings[*]', 'attribute', 'someStrings', 'type', 'TAG', 'SEPARATOR', '|'],
        ['identifier', '$.someOtherStrings[*]', 'attribute', 'someOtherStrings', 'type', 'TAG', 'SEPARATOR', '|']
      ]);
    });

    describe("when the index is dropped", () => {
      beforeEach(async () => await repository.dropIndex());

      it("the index no longer exists", () => {
        expect(async () => await fetchIndexInfo(client, 'create-drop-json:index'))
          .rejects.toThrow("Unknown Index name");
      });

      it("the index hash no longer exists", async () => {
        let hash = await fetchIndexHash(client, 'create-drop-json:index:hash');
        expect(hash).toBeNull();
      });
    });

    describe("and then the index is recreated but not changed", () => {
      beforeEach(async () => {
        await repository.createIndex();
        indexInfo = await fetchIndexInfo(client, 'create-drop-json:index');
        indexHash = await fetchIndexHash(client, 'create-drop-json:index:hash');
      });

      it("still has the expected attributes", () => {
        let indexName = indexInfo[1];
        let keyType = indexInfo[5][1];
        let prefixes = indexInfo[5][3];
        let fields = indexInfo[7];

        expect(indexName).toBe('create-drop-json:index');
        expect(keyType).toBe('JSON');
        expect(prefixes).toEqual(['create-drop-json:']);
        expect(indexHash).toBe("p2zV8lqN3AUmui41o3PSkvLZ/XQ=");

        expect(fields).toHaveLength(14);
        expect(fields).toEqual([
          ['identifier', '$.aString', 'attribute', 'aString', 'type', 'TAG', 'SEPARATOR', '|'],
          ['identifier', '$.anotherString', 'attribute', 'anotherString', 'type', 'TAG', 'SEPARATOR', '|'],
          ['identifier', '$.someText', 'attribute', 'someText', 'type', 'TEXT', 'WEIGHT', '1', 'SORTABLE'],
          ['identifier', '$.someOtherText', 'attribute', 'someOtherText', 'type', 'TEXT', 'WEIGHT', '1', 'SORTABLE'],
          ['identifier', '$.aNumber', 'attribute', 'aNumber', 'type', 'NUMERIC', 'SORTABLE'],
          ['identifier', '$.anotherNumber', 'attribute', 'anotherNumber', 'type', 'NUMERIC', 'SORTABLE'],
          ['identifier', '$.aBoolean', 'attribute', 'aBoolean', 'type', 'TAG', 'SEPARATOR', ''],
          ['identifier', '$.anotherBoolean', 'attribute', 'anotherBoolean', 'type', 'TAG', 'SEPARATOR', ''],
          ['identifier', '$.aPoint', 'attribute', 'aPoint', 'type', 'GEO'],
          ['identifier', '$.anotherPoint', 'attribute', 'anotherPoint', 'type', 'GEO'],
          ['identifier', '$.aDate', 'attribute', 'aDate', 'type', 'NUMERIC', 'SORTABLE'],
          ['identifier', '$.anotherDate', 'attribute', 'anotherDate', 'type', 'NUMERIC', 'SORTABLE'],
          ['identifier', '$.someStrings[*]', 'attribute', 'someStrings', 'type', 'TAG', 'SEPARATOR', '|'],
          ['identifier', '$.someOtherStrings[*]', 'attribute', 'someOtherStrings', 'type', 'TAG', 'SEPARATOR', '|']
        ]);
      });
    });

    describe("and then the index is changed", () => {
      beforeEach(async () => {
        schema = createJsonEntitySchema('create-drop-json-changed')
        repository = client.fetchRepository<SampleJsonEntity>(schema);

        await repository.createIndex();
        indexInfo = await fetchIndexInfo(client, 'create-drop-json-changed:index');
        indexHash = await fetchIndexHash(client, 'create-drop-json-changed:index:hash');
      });

      it("has new attributes", () => {
        let indexName = indexInfo[1];
        let keyType = indexInfo[5][1];
        let prefixes = indexInfo[5][3];

        expect(indexName).toBe('create-drop-json-changed:index');
        expect(keyType).toBe('JSON');
        expect(prefixes).toEqual(['create-drop-json-changed:']);
        expect(indexHash).toBe("j+q7Pi1/nRlHgqYoAa78xXtvKPc=");
      });
    });
  });
});
