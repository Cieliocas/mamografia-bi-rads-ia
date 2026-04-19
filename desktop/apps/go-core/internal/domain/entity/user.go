package entity

type UserID string

type UserRole string

const (
	RoleRadiologist UserRole = "radiologist"
	RoleResident    UserRole = "resident"
	RoleAdmin       UserRole = "admin"
)

// User is a placeholder for future local authentication.
type User struct {
	ID          UserID
	DisplayName string
	Role        UserRole
}
