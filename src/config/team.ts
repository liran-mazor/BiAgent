export interface TeamMember {
  name: string;
  email: string;
  role: string;
}

export const teamMembers: Record<string, TeamMember> = {
  team_leader: {
    name: 'Liran Mazor',
    email: 'lirand95@gmail.com',
    role: 'team_leader',
  },
  vp: {
    name: 'Tal Adel',
    email: 'talf18@gmail.com',
    role: 'vp',
  },
  // cto: {
  //   name: 'Roy Ben-Hayun',
  //   email: 'royb@infinitylabs.co.il',
  //   role: 'CTO',
  // },
};

// Helper function to resolve recipient (role or email)
export function resolveRecipient(recipient: string): string | null {
  // Check if it's a role first
  const member = teamMembers[recipient.toLowerCase().replace(/\s+/g, '_')];
  if (member) {
    return member.email;
  }

  // Check if it's a valid email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(recipient)) {
    return recipient;
  }

  // Not found
  return null;
}