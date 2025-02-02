import { Entry } from 'har-format';

describe('Record HAR', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('excludes a request by mime type', () => {
    cy.recordHar({ includeMimes: ['application/json'] });

    cy.get('a[href$=fetch]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('all.contain.something.like', {
        response: {
          content: { mimeType: 'application/json' }
        }
      });
  });

  it('excludes a request by its path', () => {
    const regexp = /^\/api\/products$/;
    cy.recordHar({ excludePaths: [regexp.source] });

    cy.get('a[href$=fetch]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('not.contain.something.like', {
        request: {
          url: regexp
        }
      });
  });

  it('excludes a request by the status code', () => {
    cy.recordHar({ excludeStatusCodes: [500] });

    cy.visit('/pages/unknown', { failOnStatusCode: false });

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('not.contain.something.like', {
        response: {
          status: 500
        }
      });
  });

  it('includes only a request when it host matches', () => {
    cy.recordHar({ includeHosts: ['www.openstreetmap.org'] });

    cy.get('a[href$=frame]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('all.contain.something.like', {
        request: {
          url: /www\.openstreetmap\.org/
        }
      });
  });

  it('includes only a request responding with the status code equal or greater than the threshold', () => {
    cy.recordHar({ minStatusCodeToInclude: 400 });

    cy.visit('/pages/unknown', { failOnStatusCode: false });

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('all.contain.something.like', {
        response: {
          status: 500
        }
      });
  });

  it('records a response body', () => {
    cy.recordHar();

    cy.get('a[href$=fetch]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('contain.something.like', {
        response: {
          content: { text: /\{"products":\[/ }
        }
      });
  });

  it('includes blobs loaded by the Service Worker', () => {
    cy.recordHar();

    cy.get('a[href$=service-worker]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('contain.something.like', {
        request: {
          url: /^blob:/
        }
      });
  });

  it('records the Server-Sent Events', () => {
    cy.recordHar();

    cy.get('a[href$=server-sent-events]').click();
    cy.get('ul > li', { timeout: 300 }).should('have.length.gte', 2);
    cy.get('button').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('contain.something.like', {
        _resourceType: 'EventSource',
        response: {
          content: {
            mimeType: 'text/event-stream'
          }
        }
      })
      .and((data: Entry[]) => {
        const expected = data.find(
          ({ _eventSourceMessages }: Entry) =>
            (_eventSourceMessages as unknown[]).length > 0
        );
        const eventSourceMessages = expected?._eventSourceMessages;
        expect(eventSourceMessages).to.contain.something.like({
          eventName: 'message',
          data: /^This is a message at time/
        });
      });
  });

  it('records the WebSocket frames', () => {
    cy.recordHar();

    cy.get('a[href$=websocket]').click();
    cy.get('ul > li', { timeout: 300 }).should('have.length.gte', 2);
    cy.get('button').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('contain.something.like', {
        request: {
          url: 'ws://localhost:8080/ws'
        },
        response: {
          status: 101
        }
      })
      .and((data: Entry[]) => {
        const expected = data.find(
          ({ _webSocketMessages }: Entry) =>
            (_webSocketMessages as unknown[]).length > 0
        );
        const webSocketMessages = expected?._webSocketMessages;
        expect(webSocketMessages).to.contain.something.like({
          type: 'response',
          data: /^This is a message at time/
        });
        expect(webSocketMessages).to.contain.something.like({
          type: 'request',
          data: 'Hello Server!'
        });
      });
  });

  it('records requests from the Shared Worker', () => {
    cy.recordHar();

    cy.get('a[href="pages/worker"]').click();

    cy.get('#number1').type('2');
    cy.get('#number2').type('4');
    cy.get('#sum-shared-worker').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('contain.something.like', {
        request: {
          url: /math$/,
          postData: {
            mimeType: 'application/json',
            text: /"op":"sum"/
          }
        }
      });
  });

  it('records requests from the Web Worker', () => {
    cy.recordHar();

    cy.get('a[href="pages/worker"]').click();

    cy.get('#number1').type('2');
    cy.get('#number2').type('4');
    cy.get('#sum-web-worker').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('contain.something.like', {
        request: {
          url: /math$/,
          postData: {
            mimeType: 'application/json',
            text: /"op":"sum"/
          }
        }
      });
  });

  it('excludes blobs loaded by the Service Worker', () => {
    cy.recordHar({ includeBlobs: false });

    cy.get('a[href$=service-worker]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('not.contain.something.like', {
        request: {
          url: /^blob:/
        }
      });
  });

  it('skips loading a response body', () => {
    cy.recordHar({ content: false });

    cy.get('a[href$=fetch]').click();

    cy.saveHar({ waitForIdle: true });

    cy.findHar()
      .its('log.entries')
      .should('not.contain.something.like', {
        response: {
          content: { text: /\{"products":\[/, mimeType: 'application/json' }
        }
      });
  });
});
