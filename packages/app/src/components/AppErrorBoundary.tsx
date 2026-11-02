import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";

import { colors, fonts, spacing, themedSheet } from "../theme";
import { ActionButton } from "./ui";

interface State {
  readonly hasError: boolean;
  readonly message: string | null;
}

/**
 * Contained rendering-failure boundary. A malformed or version-skewed snapshot
 * must not turn the whole app into a blank screen; the player gets a visible
 * message and can retry rendering. If retrying fails, the header's worker
 * restart or a full app reload is the recovery path.
 */
interface Props {
  readonly children: ReactNode;
  readonly onRestart?: () => void;
}

export class AppErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false, message: null };

  public static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Keep the diagnosis available in development logs without exposing world state.
    console.error("Fabric of Nations UI render failure", error, info.componentStack);
  }

  public override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>The interface could not render the current snapshot.</Text>
        <Text style={styles.message}>{this.state.message ?? "Unknown rendering error."}</Text>
        <Text style={styles.note}>
          Your simulation may still be running in the worker. Retry rendering; if the error
          repeats, restart the worker and load a saved game. Unsaved progress after a worker
          restart cannot be recovered.
        </Text>
        <ActionButton
          label="Retry rendering"
          tone="accent"
          onPress={() => this.setState({ hasError: false, message: null })}
        />
        {this.props.onRestart === undefined ? null : (
          <ActionButton
            label="Restart worker"
            tone="danger"
            onPress={() => {
              this.setState({ hasError: false, message: null });
              this.props.onRestart?.();
            }}
          />
        )}
      </View>
    );
  }
}

const styles = themedSheet(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: "center",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.sansSemiBold,
  },
  message: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
}));
