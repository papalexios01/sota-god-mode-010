
# NeuronWriter CORS Fix via Supabase Edge Function

## Problem Analysis
The NeuronWriter API is failing with CORS errors because:
1. Browser security prevents direct API calls to `app.neuronwriter.com`
2. The existing Supabase edge function (`supabase/functions/neuronwriter-proxy/index.ts`) exists but is **not deployed**
3. No Supabase connection is configured - missing `VITE_SUPABASE_URL`
4. Missing `supabase/config.toml` configuration file

## Solution Overview
Connect to Lovable Cloud (Supabase backend), configure the edge function properly, and update the frontend to use it.

```text
┌──────────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│   Browser/App    │────▶│ Supabase Edge Func │────▶│ NeuronWriter API    │
│                  │     │ neuronwriter-proxy │     │ app.neuronwriter.com│
│  No CORS issues  │◀────│  (server-side)     │◀────│                     │
└──────────────────┘     └────────────────────┘     └─────────────────────┘
```

---

## Implementation Steps

### Step 1: Enable Lovable Cloud Connection
This will automatically provision a Supabase backend and provide the required environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

### Step 2: Create Supabase Configuration
Create `supabase/config.toml` to properly register the edge functions:

```toml
project_id = "default"

[functions.neuronwriter-proxy]
verify_jwt = false

[functions.fetch-sitemap]
verify_jwt = false
```

### Step 3: Update Edge Function (Minor Improvements)
Enhance the existing `neuronwriter-proxy/index.ts` with:
- Better error logging for debugging
- Extended CORS headers for Supabase client compatibility
- Improved timeout handling per endpoint type

### Step 4: Create Supabase Client Integration
Create `src/integrations/supabase/client.ts` to properly initialize the Supabase client for calling edge functions.

### Step 5: Update NeuronWriterService
Modify `src/lib/sota/NeuronWriterService.ts` to:
- Use Supabase client's `functions.invoke()` method (preferred)
- Fall back to direct URL construction if needed
- Remove browser-side direct API attempts (they will always fail due to CORS)

### Step 6: Update SetupConfig Component
Update the UI to:
- Show proper connection status
- Auto-fetch projects when API key is entered
- Display helpful error messages if Supabase is not connected

---

## Technical Details

### File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/config.toml` | Create | Register edge functions with JWT disabled |
| `src/integrations/supabase/client.ts` | Create | Supabase client for edge function calls |
| `supabase/functions/neuronwriter-proxy/index.ts` | Update | Enhance logging and CORS headers |
| `src/lib/sota/NeuronWriterService.ts` | Update | Use Supabase client for proxy calls |
| `src/components/optimizer/steps/SetupConfig.tsx` | Update | Better UX for connection status |

### New Supabase Client Code
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export const isSupabaseConfigured = () => !!supabase;
```

### Updated NeuronWriterService Proxy Logic
```typescript
private async makeProxyRequest<T>(endpoint: string, method: string, body?: Record<string, unknown>) {
  // Use Supabase functions.invoke (preferred method)
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('neuronwriter-proxy', {
      body: { endpoint, method, apiKey: this.apiKey, body }
    });
    
    if (error) throw error;
    return { success: true, data: data?.data as T };
  }
  
  // Fallback to direct URL fetch (for production deployments)
  // ...
}
```

---

## Dependencies
- `@supabase/supabase-js` package (need to add to package.json)

## After Implementation
Once Lovable Cloud is enabled and the changes are deployed:
1. Edge functions will be automatically deployed
2. NeuronWriter API calls will route through the server-side proxy
3. CORS issues will be completely resolved
4. Projects will auto-load when API key is entered

---

## Testing Checklist
- [ ] Enable Lovable Cloud connection
- [ ] Verify edge function deploys successfully  
- [ ] Enter NeuronWriter API key in Setup
- [ ] Confirm projects dropdown populates
- [ ] Select a project and verify it saves to config
