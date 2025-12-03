import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  componentDidCatch(error, info) {
    this.setState({ error, info })
    // also log to console
    console.error('ErrorBoundary caught', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{padding:20,background:'rgba(255,0,0,0.04)',borderRadius:8}}>
          <h3 style={{color:'var(--accent)'}}>An error occurred rendering this view</h3>
          <div style={{color:'var(--muted)',whiteSpace:'pre-wrap',fontFamily:'monospace',fontSize:12}}>{String(this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error)}</div>
          <div style={{marginTop:8,color:'var(--muted)'}}>Open the browser console for more details.</div>
        </div>
      )
    }
    return this.props.children
  }
}
