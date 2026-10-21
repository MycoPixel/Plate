import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { t } from './i18n'
import './ErrorBoundary.css'

type Props = {
  /** Names the panel being guarded. Without it the boundary guards the whole app. */
  label?: string
  children: ReactNode
}

type State = { failed: Error | null }

/**
 * Keeps a rendering error in one place from blanking the whole editor. The Inspector,
 * which draws whatever a figure contains, gets its own boundary; a bad value there
 * hides the panel instead of losing the board beside it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: null }

  static getDerivedStateFromError(error: Error): State {
    return { failed: error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`EnlacePlot: ${this.props.label ?? 'the editor'} failed to render`, error, info.componentStack)
  }

  render() {
    const failed = this.state.failed
    if (!failed) return this.props.children
    return (
      <div className="boundary" role="alert">
        <h2>{t('Something went wrong')}</h2>
        <p>
          {this.props.label
            ? t('This panel hit an error it could not recover from. The rest of the editor still works, and your figure is saved.')
            : t('The editor stopped because of an unexpected error. Your figure is saved automatically; reload to carry on.')}
        </p>
        {this.props.label ? (
          <button type="button" className="btn" onClick={() => this.setState({ failed: null })}>
            {t('Try again')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t('Reload the editor')}
          </button>
        )}
        {failed.message && <pre className="boundary-detail">{failed.message}</pre>}
      </div>
    )
  }
}
