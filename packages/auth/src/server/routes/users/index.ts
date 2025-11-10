import { getUserProfileContract } from "@/lib/contracts/users";
import { createApp } from '@spfn/core/route';
import { getAuth } from '@/server/helpers';
import { getUserProfileService } from '@/server/services/user-profile.service';

const app = createApp();

// GET /users/profile (Authenticated)
app.bind(getUserProfileContract, async (c) =>
{
    const { userId } = getAuth(c);
    const result = await getUserProfileService(userId);
    return c.success(result);
});

export default app;