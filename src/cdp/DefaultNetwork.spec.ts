import { DefaultNetwork } from './DefaultNetwork';
import {
  mock,
  instance,
  when,
  verify,
  anyFunction,
  reset,
  deepEqual,
  anything
} from 'ts-mockito';
import type { Client } from 'chrome-remote-interface';
import {
  beforeEach,
  describe,
  jest,
  it,
  expect,
  afterEach
} from '@jest/globals';
import type Protocol from 'devtools-protocol';

describe('DefaultNetwork', () => {
  const clientMock = mock<Client>();
  const listener = jest.fn();

  let sut!: DefaultNetwork;

  beforeEach(() => {
    sut = new DefaultNetwork(instance(clientMock));
  });

  afterEach(() => {
    listener.mockReset();
    reset(clientMock);
  });

  describe('attachToTargets', () => {
    it('should listen to CDP events', async () => {
      // act
      await sut.attachToTargets(listener);
      // assert
      verify(clientMock.on('event', anyFunction())).once();
    });

    it('should pass only network events to the registered listener', async () => {
      const unexpectedEvent = {
        method: 'Security.certificateError',
        params: {
          eventId: 1,
          errorType: 'error',
          requestURL: 'http://example.com'
        }
      };
      const expectedEvent = {
        method: 'Network.requestWillBeSentExtraInfo',
        params: {
          requestId: '1',
          headers: {
            Cookie: 'foo=bar'
          },
          connectTiming: {
            requestTime: 1
          }
        }
      };
      when(clientMock.on('event', anyFunction())).thenCall((_, callback) => {
        callback(unexpectedEvent);
        callback(expectedEvent);
      });
      // act
      await sut.attachToTargets(listener);
      // assert
      expect(listener).toHaveBeenNthCalledWith(1, expectedEvent);
    });

    it('should register a handle to ignore certificate errors', async () => {
      // act
      await sut.attachToTargets(listener);
      // assert
      verify(clientMock.on('Security.certificateError', anyFunction())).once();
      verify(clientMock.send('Security.enable')).once();
      verify(
        clientMock.send(
          'Security.setOverrideCertificateErrors',
          deepEqual({
            override: true
          })
        )
      ).once();
    });

    it('should start tracking sessions', async () => {
      // act
      await sut.attachToTargets(listener);
      // assert
      verify(clientMock.on('Network.requestWillBeSent', anyFunction())).once();
      verify(clientMock.on('Network.webSocketCreated', anyFunction())).once();
    });

    it('should attach to the root target', async () => {
      // act
      await sut.attachToTargets(listener);
      // assert
      verify(
        clientMock.send(
          'Target.setAutoAttach',
          deepEqual({
            autoAttach: true,
            flatten: true,
            waitForDebuggerOnStart: true
          }),
          undefined
        )
      ).once();
      verify(
        clientMock.send('Network.enable', deepEqual({}), undefined)
      ).never();
      verify(
        clientMock.send(
          'Network.setCacheDisabled',
          deepEqual({ cacheDisabled: true }),
          undefined
        )
      ).never();
      verify(clientMock.on('Target.attachedToTarget', anyFunction())).once();
    });

    it('should not listen to network events when attaching to the root target', async () => {
      // act
      await sut.attachToTargets(listener);
      // assert
      verify(
        clientMock.send('Network.enable', deepEqual({}), undefined)
      ).never();
      verify(
        clientMock.send(
          'Network.setCacheDisabled',
          deepEqual({ cacheDisabled: true }),
          undefined
        )
      ).never();
    });

    it.each([{ input: 'tab' }, { input: 'browser' }, { input: 'other' }])(
      'should not listen to network events when attaching to the $input target',
      async ({ input }) => {
        // arrange
        const sessionId = '1';
        const targetInfo: Protocol.Target.TargetInfo = {
          targetId: '1',
          type: input,
          url: '',
          title: '',
          attached: true,
          canAccessOpener: false
        };
        let act!: (...args: unknown[]) => Promise<void>;
        when(clientMock.on('Target.attachedToTarget', anyFunction())).thenCall(
          (_, callback) => (act = callback)
        );
        await sut.attachToTargets(listener);
        // act
        await act({ sessionId, targetInfo, waitingForDebugger: false });
        // assert
        verify(
          clientMock.send('Network.enable', deepEqual({}), undefined)
        ).never();
        verify(
          clientMock.send(
            'Network.setCacheDisabled',
            deepEqual({ cacheDisabled: true }),
            undefined
          )
        ).never();
      }
    );

    it('should recursively attach to new targets', async () => {
      // arrange
      const sessionId = '1';
      const targetInfo: Protocol.Target.TargetInfo = {
        targetId: '1',
        type: 'page',
        url: '',
        title: '',
        attached: true,
        canAccessOpener: false
      };
      let act: ((...args: unknown[]) => Promise<void>) | undefined;
      when(clientMock.on('Target.attachedToTarget', anyFunction())).thenCall(
        (_, callback) => (act = callback)
      );
      await sut.attachToTargets(listener);
      // act
      await act?.({ sessionId, targetInfo, waitingForDebugger: false });
      // assert
      verify(
        clientMock.send(
          'Target.setAutoAttach',
          deepEqual({
            autoAttach: true,
            flatten: true,
            waitForDebuggerOnStart: true
          }),
          sessionId
        )
      ).once();
      verify(clientMock.on('Target.attachedToTarget', anyFunction())).once();
    });

    it.each([
      { input: 'service_worker' },
      { input: 'page' },
      { input: 'worker' },
      { input: 'background_page' },
      { input: 'webview' },
      { input: 'shared_worker' }
    ])(
      'should listen to network events when attaching to the $input target',
      async ({ input }) => {
        // arrange
        const sessionId = '1';
        const targetInfo: Protocol.Target.TargetInfo = {
          targetId: '1',
          type: input,
          url: '',
          title: '',
          attached: true,
          canAccessOpener: false
        };
        let act: ((...args: unknown[]) => Promise<void>) | undefined;
        when(clientMock.on('Target.attachedToTarget', anyFunction())).thenCall(
          (_, callback) => (act = callback)
        );
        await sut.attachToTargets(listener);
        // act
        await act?.({ sessionId, targetInfo, waitingForDebugger: false });
        // assert
        verify(
          clientMock.send('Network.enable', deepEqual({}), sessionId)
        ).once();
        verify(
          clientMock.send(
            'Network.setCacheDisabled',
            deepEqual({ cacheDisabled: true }),
            sessionId
          )
        ).once();
      }
    );

    it('should run if waiting for debugger', async () => {
      // arrange
      const sessionId = '1';
      const targetInfo: Protocol.Target.TargetInfo = {
        targetId: '1',
        type: 'page',
        url: '',
        title: '',
        attached: true,
        canAccessOpener: false
      };
      let act: ((...args: unknown[]) => Promise<void>) | undefined;
      when(clientMock.on('Target.attachedToTarget', anyFunction())).thenCall(
        (_, callback) => (act = callback)
      );
      await sut.attachToTargets(listener);
      // act
      await act?.({ sessionId, targetInfo, waitingForDebugger: true });
      // assert
      verify(
        clientMock.send('Runtime.runIfWaitingForDebugger', undefined, sessionId)
      ).once();
    });

    it('should ignore certificate errors', async () => {
      // arrange
      const eventId = 1;
      when(clientMock.on('Security.certificateError', anyFunction())).thenCall(
        (_, callback) => callback({ eventId })
      );
      // act
      await sut.attachToTargets(listener);
      // assert
      verify(clientMock.on('Security.certificateError', anyFunction())).once();
      verify(
        clientMock.send(
          'Security.handleCertificateError',
          deepEqual<Protocol.Security.HandleCertificateErrorRequest>({
            eventId,
            action: 'continue'
          })
        )
      ).once();
    });
  });

  describe('detachFromTargets', () => {
    it('should remove listeners when they are present', async () => {
      // arrange
      await sut.attachToTargets(listener);
      // act
      await sut.detachFromTargets();
      // assert
      verify(clientMock.off('event', anyFunction())).once();
      verify(clientMock.off('Security.certificateError', anyFunction())).once();
      verify(clientMock.off('Target.attachedToTarget', anyFunction())).once();
      verify(clientMock.off('Network.requestWillBeSent', anyFunction())).once();
      verify(clientMock.off('Network.webSocketCreated', anyFunction())).once();
    });

    it('should not remove listeners when no subscription yet', async () => {
      // act
      await sut.detachFromTargets();
      // assert
      verify(clientMock.off('event', anyFunction())).never();
      verify(
        clientMock.off('Security.certificateError', anyFunction())
      ).never();
      verify(clientMock.off('Target.attachedToTarget', anyFunction())).never();
      verify(
        clientMock.off('Network.requestWillBeSent', anyFunction())
      ).never();
      verify(clientMock.off('Network.webSocketCreated', anyFunction())).never();
    });

    it('should unsubscribe from the security domain', async () => {
      // act
      await sut.detachFromTargets();
      // assert
      verify(clientMock.send('Security.disable')).once();
    });

    it('should detach from the targets', async () => {
      // act
      await sut.detachFromTargets();
      // assert
      verify(
        clientMock.send(
          'Target.setAutoAttach',
          deepEqual({
            autoAttach: false,
            flatten: true,
            waitForDebuggerOnStart: true
          }),
          undefined
        )
      ).once();
    });
  });

  describe('getRequestBody', () => {
    it('should receive a request body for given request', async () => {
      // arrange
      const requestId = '1';
      const expected = {
        postData: 'test'
      };
      when(
        clientMock.send(
          'Network.getRequestPostData',
          deepEqual({ requestId }),
          anything() as string
        )
      ).thenResolve(expected);
      // act
      const result = await sut.getRequestBody(requestId);
      // assert
      expect(result).toMatchObject(expected);
    });
  });

  describe('getResponseBody', () => {
    it('should receive a request body for given request', async () => {
      // arrange
      const requestId = '1';
      const expected = {
        body: 'test',
        base64Encoded: false
      };
      when(
        clientMock.send(
          'Network.getResponseBody',
          deepEqual({ requestId }),
          anything() as string
        )
      ).thenResolve(expected);
      // act
      const result = await sut.getResponseBody(requestId);
      // assert
      expect(result).toMatchObject(expected);
    });
  });
});
