import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenTelemetry } from '@ai-sdk/otel';
import {
  NoOutputGeneratedError,
  registerTelemetry,
  simulateReadableStream,
  streamText,
} from 'ai';
import { MockLanguageModelV3, convertReadableStreamToArray } from 'ai/test';
import './style.css';

type Rejection = { name: string; message: string; noOutput: boolean };

registerTelemetry(new OpenTelemetry());

function App() {
  const [result, setResult] = useState<{
    telemetry: boolean;
    streamError: boolean;
  }>();
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      const error = event.reason;
      setRejections(rejections => [
        ...rejections,
        {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          noOutput: NoOutputGeneratedError.isInstance(error),
        },
      ]);
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () =>
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  async function run(telemetry: boolean) {
    setRunning(true);
    setResult(undefined);
    setRejections([]);

    try {
      const result = streamText({
        model: new MockLanguageModelV3({
          doStream: async () => ({
            // No output or terminal chunk triggers NoOutputGeneratedError.
            stream: simulateReadableStream({ chunks: [] }),
          }),
        }),
        prompt: 'Hello',
        telemetry: { isEnabled: telemetry },
      });
      const parts = await convertReadableStreamToArray(result.stream);
      const error = parts.find(part => part.type === 'error');

      setResult({
        telemetry,
        streamError:
          error?.type === 'error' &&
          NoOutputGeneratedError.isInstance(error.error),
      });
    } finally {
      setRunning(false);
    }
  }

  const report = result && {
    ...result,
    unhandledNoOutputErrors: rejections.filter(error => error.noOutput).length,
    unhandledRejections: rejections,
  };

  return (
    <>
      <div className="controls">
        <button disabled={running} onClick={() => void run(true)} type="button">
          Run with telemetry
        </button>
        <button
          disabled={running}
          onClick={() => void run(false)}
          type="button"
        >
          Run without telemetry
        </button>
      </div>
      <output>
        {running ? 'Running...' : JSON.stringify(report, null, 2)}
      </output>
    </>
  );
}

const root = document.querySelector('#root');
if (root == null) throw new Error('Could not find the React root element.');
createRoot(root).render(<App />);
